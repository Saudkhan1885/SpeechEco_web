"""
Speech-to-Text Service - Real-time voice recognition using Whisper
Supports multiple languages and provides accurate transcription
"""
import os
import sys
import uuid
import asyncio
import subprocess
from typing import Optional, Tuple, Dict
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import tempfile
import wave
import io

# Audio processing
try:
    import torch
    import torchaudio
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("Warning: PyTorch not available for STT")

# Whisper for STT
try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False
    print("Warning: faster-whisper not available. Trying openai-whisper...")
    
    try:
        import whisper
        OPENAI_WHISPER_AVAILABLE = True
    except ImportError:
        OPENAI_WHISPER_AVAILABLE = False
        print("Warning: openai-whisper not available. STT features disabled.")

from app.config import UPLOADS_DIR


class STTService:
    """Speech-to-Text service using Whisper models"""
    
    _instance = None
    _model = None
    _executor = ThreadPoolExecutor(max_workers=2)
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        self._device = self._detect_device()
        self._model_size = "base"  # Options: tiny, base, small, medium, large-v3
        self._compute_type = "float16" if self._device == "cuda" else "float32"
    
    def _detect_device(self) -> str:
        """Detect best available device"""
        if TORCH_AVAILABLE:
            if torch.cuda.is_available():
                return "cuda"
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                return "mps"
        return "cpu"
    
    @property
    def device(self) -> str:
        return self._device
    
    @property
    def is_available(self) -> bool:
        return FASTER_WHISPER_AVAILABLE or OPENAI_WHISPER_AVAILABLE
    
    def _load_model(self):
        """Lazy load the Whisper model"""
        if self._model is not None:
            return self._model
        
        if FASTER_WHISPER_AVAILABLE:
            print(f"Loading faster-whisper model ({self._model_size}) on {self._device}...")
            try:
                self._model = WhisperModel(
                    self._model_size,
                    device=self._device,
                    compute_type=self._compute_type
                )
                print("Faster-whisper model loaded successfully!")
                return self._model
            except Exception as e:
                print(f"Error loading faster-whisper: {e}")
        
        if OPENAI_WHISPER_AVAILABLE:
            print(f"Loading openai-whisper model ({self._model_size}) on {self._device}...")
            try:
                self._model = whisper.load_model(self._model_size, device=self._device)
                print("OpenAI Whisper model loaded successfully!")
                return self._model
            except Exception as e:
                print(f"Error loading openai-whisper: {e}")
        
        return None
    
    def transcribe_audio_file(
        self,
        audio_path: str,
        language: Optional[str] = None,
        task: str = "transcribe"
    ) -> Dict:
        """
        Transcribe audio file to text.
        
        Args:
            audio_path: Path to audio file
            language: Language code (e.g., 'en', 'es', 'zh'). None for auto-detect.
            task: 'transcribe' or 'translate' (translate to English)
            
        Returns:
            Dict with transcription results
        """
        model = self._load_model()
        if model is None:
            raise RuntimeError("STT model not available")
        
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        try:
            if FASTER_WHISPER_AVAILABLE and isinstance(model, WhisperModel):
                # Using faster-whisper
                segments, info = model.transcribe(
                    audio_path,
                    language=language,
                    task=task,
                    beam_size=5,
                    vad_filter=True,  # Voice activity detection
                    vad_parameters=dict(
                        min_silence_duration_ms=500,
                        speech_pad_ms=400
                    )
                )
                
                # Collect all segments
                text_segments = []
                full_text_parts = []
                
                for segment in segments:
                    text_segments.append({
                        "start": segment.start,
                        "end": segment.end,
                        "text": segment.text.strip(),
                        "confidence": getattr(segment, 'avg_logprob', 0)
                    })
                    full_text_parts.append(segment.text.strip())
                
                return {
                    "text": " ".join(full_text_parts),
                    "language": info.language,
                    "language_probability": info.language_probability,
                    "duration": info.duration,
                    "segments": text_segments,
                    "model": f"faster-whisper-{self._model_size}"
                }
            
            elif OPENAI_WHISPER_AVAILABLE:
                # Using openai-whisper
                options = {
                    "task": task,
                    "fp16": self._device == "cuda"
                }
                if language:
                    options["language"] = language
                
                result = model.transcribe(audio_path, **options)
                
                segments = []
                for seg in result.get("segments", []):
                    segments.append({
                        "start": seg["start"],
                        "end": seg["end"],
                        "text": seg["text"].strip(),
                        "confidence": seg.get("avg_logprob", 0)
                    })
                
                return {
                    "text": result["text"].strip(),
                    "language": result.get("language", "unknown"),
                    "language_probability": 0.0,
                    "duration": segments[-1]["end"] if segments else 0,
                    "segments": segments,
                    "model": f"openai-whisper-{self._model_size}"
                }
            
            else:
                raise RuntimeError("No Whisper model available")
                
        except Exception as e:
            print(f"Transcription error: {e}")
            raise RuntimeError(f"Failed to transcribe audio: {str(e)}")
    
    def transcribe_audio_bytes(
        self,
        audio_bytes: bytes,
        format: str = "wav",
        language: Optional[str] = None,
        task: str = "transcribe"
    ) -> Dict:
        """
        Transcribe audio from bytes.
        
        Args:
            audio_bytes: Raw audio bytes
            format: Audio format (wav, mp3, webm, etc.)
            language: Language code for transcription
            task: 'transcribe' or 'translate'
            
        Returns:
            Dict with transcription results
        """
        # Save to temporary file
        temp_path = os.path.join(UPLOADS_DIR, f"temp_audio_{uuid.uuid4()}.{format}")
        wav_path = None
        
        try:
            with open(temp_path, 'wb') as f:
                f.write(audio_bytes)
            
            # For non-WAV formats (especially webm), convert to WAV first 
            # to avoid ffmpeg parsing issues with browser-recorded audio
            transcribe_path = temp_path
            if format.lower() in ('webm', 'ogg', 'm4a', 'mp4'):
                wav_path = os.path.join(UPLOADS_DIR, f"temp_audio_{uuid.uuid4()}.wav")
                try:
                    result = subprocess.run(
                        ['ffmpeg', '-y', '-i', temp_path, '-ar', '16000', '-ac', '1', '-f', 'wav', wav_path],
                        capture_output=True, text=True, timeout=30
                    )
                    if result.returncode == 0 and os.path.exists(wav_path) and os.path.getsize(wav_path) > 0:
                        transcribe_path = wav_path
                        print(f"[STT] Converted {format} to WAV successfully")
                    else:
                        print(f"[STT] FFmpeg conversion failed (rc={result.returncode}): {result.stderr[-200:] if result.stderr else 'no stderr'}")
                        # Fall through to try with original file
                except Exception as e:
                    print(f"[STT] FFmpeg conversion error: {e}")
                    # Fall through to try with original file
            
            return self.transcribe_audio_file(transcribe_path, language, task)
            
        finally:
            # Clean up temp files
            if os.path.exists(temp_path):
                os.remove(temp_path)
            if wav_path and os.path.exists(wav_path):
                os.remove(wav_path)
    
    async def transcribe_audio_file_async(
        self,
        audio_path: str,
        language: Optional[str] = None,
        task: str = "transcribe"
    ) -> Dict:
        """Async wrapper for transcribe_audio_file"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: self.transcribe_audio_file(audio_path, language, task)
        )
    
    async def transcribe_audio_bytes_async(
        self,
        audio_bytes: bytes,
        format: str = "wav",
        language: Optional[str] = None,
        task: str = "transcribe"
    ) -> Dict:
        """Async wrapper for transcribe_audio_bytes"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: self.transcribe_audio_bytes(audio_bytes, format, language, task)
        )
    
    def save_audio_upload(self, audio_bytes: bytes, original_filename: str) -> str:
        """
        Save uploaded audio file.
        
        Returns:
            Path to saved file
        """
        extension = Path(original_filename).suffix or '.wav'
        filename = f"upload_{uuid.uuid4()}{extension}"
        filepath = os.path.join(UPLOADS_DIR, filename)
        
        with open(filepath, 'wb') as f:
            f.write(audio_bytes)
        
        return filepath
    
    def get_model_info(self) -> Dict:
        """Get STT model information"""
        return {
            "available": self.is_available,
            "device": self._device,
            "model_size": self._model_size,
            "compute_type": self._compute_type,
            "model_loaded": self._model is not None,
            "backend": "faster-whisper" if FASTER_WHISPER_AVAILABLE else (
                "openai-whisper" if OPENAI_WHISPER_AVAILABLE else "none"
            ),
            "supported_languages": [
                "en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr",
                "pl", "ca", "nl", "ar", "sv", "it", "id", "hi", "fi", "vi",
                "he", "uk", "el", "ms", "cs", "ro", "da", "hu", "ta", "no",
                "th", "ur", "hr", "bg", "lt", "la", "mi", "ml", "cy", "sk",
                "te", "fa", "lv", "bn", "sr", "az", "sl", "kn", "et", "mk",
                "br", "eu", "is", "hy", "ne", "mn", "bs", "kk", "sq", "sw",
                "gl", "mr", "pa", "si", "km", "sn", "yo", "so", "af", "oc",
                "ka", "be", "tg", "sd", "gu", "am", "yi", "lo", "uz", "fo",
                "ht", "ps", "tk", "nn", "mt", "sa", "lb", "my", "bo", "tl",
                "mg", "as", "tt", "haw", "ln", "ha", "ba", "jw", "su"
            ]
        }
    
    def set_model_size(self, size: str):
        """
        Change model size. Requires model reload.
        
        Args:
            size: Model size (tiny, base, small, medium, large-v3)
        """
        valid_sizes = ["tiny", "base", "small", "medium", "large", "large-v2", "large-v3"]
        if size not in valid_sizes:
            raise ValueError(f"Invalid model size. Choose from: {valid_sizes}")
        
        self._model_size = size
        self._model = None  # Force reload on next use


# Singleton instance
stt_service = STTService()
