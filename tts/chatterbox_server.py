"""Tiny long-lived Chatterbox TTS server. POST /tts {text, exaggeration, cfg_weight, voice_prompt?} -> audio/wav.
GET /health -> {"ok": true, "device": ...}. Run: tts/.venv/bin/python tts/chatterbox_server.py"""
import io, json, sys, threading, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch

PORT = 7861
device = "mps" if torch.backends.mps.is_available() else "cpu"

# Chatterbox checkpoints are saved from CUDA; force them onto the chosen device when loading.
_orig_load = torch.load
torch.load = lambda *a, **k: _orig_load(*a, **{**k, "map_location": torch.device(device)})

from chatterbox.tts import ChatterboxTTS  # noqa: E402

print(f"[chatterbox] loading model on {device} ...", flush=True)
model = ChatterboxTTS.from_pretrained(device=device)
lock = threading.Lock()
print("[chatterbox] ready", flush=True)


def to_wav(wav_tensor, sr):
    a = wav_tensor.squeeze().detach().cpu().numpy().astype(np.float32)
    pcm = (np.clip(a, -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, json.dumps({"ok": True, "device": device}).encode())
        else:
            self._send(404, b"{}")

    def do_POST(self):
        if self.path != "/tts":
            return self._send(404, b"{}")
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            kw = dict(exaggeration=float(req.get("exaggeration", 0.5)), cfg_weight=float(req.get("cfg_weight", 0.5)))
            if req.get("voice_prompt"):
                kw["audio_prompt_path"] = req["voice_prompt"]
            with lock:
                wav = model.generate(req["text"], **kw)
            self._send(200, to_wav(wav, model.sr), "audio/wav")
        except Exception as e:  # noqa: BLE001
            self._send(500, json.dumps({"error": str(e)}).encode())

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
