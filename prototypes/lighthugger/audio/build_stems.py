#!/usr/bin/env python3
"""Offline NASA Public-Domain audio stem builder for Lighthugger.

Downloads verified PD-USGov-NASA recordings from Wikimedia Commons into a
temporary directory, processes them with Python DSP (numpy/scipy/librosa/soundfile)
and FFmpeg into compact Web Audio stems + a hull convolution impulse response,
records manifest.json and ATTRIBUTION.md, and removes the temporary raw cache.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
IR_SR = 24000
LOOP_PAD_SEC = 0.15
LOOP_START_SEC = 0.12
USER_AGENT = "LighthuggerAudioBuilder/1.0 (https://lastnpcalex.agency; NASA PD audio)"

SOURCES: dict[str, dict[str, str]] = {
    "saturn_rpws_1": {
        "title": "File:Saturn sound.ogg",
        "credit": "NASA/JPL/University of Iowa",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "Cassini RPWS Saturn auroral radio emissions (sample 1)",
        "url": "https://upload.wikimedia.org/wikipedia/commons/d/d4/Saturn_sound.ogg",
        "commons_url": "https://commons.wikimedia.org/wiki/File:Saturn_sound.ogg",
        "filename": "saturn_sound.ogg",
    },
    "saturn_rpws_2": {
        "title": "File:Saturn sound2.ogg",
        "credit": "NASA/JPL/University of Iowa",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "Cassini RPWS Saturn radio emissions PIA07966",
        "url": "https://upload.wikimedia.org/wikipedia/commons/9/90/Saturn_sound2.ogg",
        "commons_url": "https://commons.wikimedia.org/wiki/File:Saturn_sound2.ogg",
        "filename": "saturn_sound2.ogg",
    },
    "jupiter_rpws": {
        "title": "File:Cassini RPWS Jupiter 010104.ogg",
        "credit": "NASA/JPL/University of Iowa",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "Cassini RPWS Jupiter bow shock and plasma waves",
        "url": "https://upload.wikimedia.org/wikipedia/commons/9/93/Cassini_RPWS_Jupiter_010104.ogg",
        "commons_url": "https://commons.wikimedia.org/wiki/File:Cassini_RPWS_Jupiter_010104.ogg",
        "filename": "cassini_jupiter.ogg",
    },
    "enceladus_rpws": {
        "title": "File:Cassini - Enceladus Sound.mp3",
        "credit": "NASA/JPL/University of Iowa",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "Cassini RPWS plasma waves near Enceladus plume",
        "url": "https://upload.wikimedia.org/wikipedia/commons/c/cc/Cassini_-_Enceladus_Sound.mp3",
        "commons_url": "https://commons.wikimedia.org/wiki/File:Cassini_-_Enceladus_Sound.mp3",
        "filename": "cassini_enceladus.mp3",
    },
    "saturn_lightning": {
        "title": "File:Lightning Strikes at Saturn (PIA14310).wav",
        "credit": "NASA/JPL-Caltech/University of Iowa",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "Cassini RPWS electrostatic lightning discharges at Saturn",
        "url": "https://upload.wikimedia.org/wikipedia/commons/f/f0/Lightning_Strikes_at_Saturn_%28PIA14310%29.wav",
        "commons_url": "https://commons.wikimedia.org/wiki/File:Lightning_Strikes_at_Saturn_(PIA14310).wav",
        "filename": "saturn_lightning.wav",
    },
    "earth_chorus": {
        "title": "File:Chorus Radio Waves within Earth's Atmosphere.mp3",
        "credit": "NASA/Van Allen Probes EMFISIS",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "NASA EMFISIS magnetospheric chorus plasma radio waves",
        "url": "https://upload.wikimedia.org/wikipedia/commons/9/94/Chorus_Radio_Waves_within_Earth%27s_Atmosphere.mp3",
        "commons_url": "https://commons.wikimedia.org/wiki/File:Chorus_Radio_Waves_within_Earth%27s_Atmosphere.mp3",
        "filename": "earth_chorus.mp3",
    },
    "perseverance_cruise": {
        "title": "File:Perseverance Rover's Interplanetary Sound.oga",
        "credit": "NASA/JPL-Caltech/DPA",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "Perseverance internal heat-rejection fluid pump during interplanetary cruise",
        "url": "https://upload.wikimedia.org/wikipedia/commons/2/26/Perseverance_Rover%27s_Interplanetary_Sound.oga",
        "commons_url": "https://commons.wikimedia.org/wiki/File:Perseverance_Rover%27s_Interplanetary_Sound.oga",
        "filename": "perseverance_cruise.oga",
    },
    "perseverance_mars": {
        "title": "File:NASA's Perseverance Rover Microphone Captures Sounds from Mars.ogg",
        "credit": "NASA/JPL-Caltech",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "Perseverance Mars EDL microphone capture (Martian breeze and mechanical hum)",
        "url": "https://upload.wikimedia.org/wikipedia/commons/a/a5/NASA%27s_Perseverance_Rover_Microphone_Captures_Sounds_from_Mars.ogg",
        "commons_url": "https://commons.wikimedia.org/wiki/File:NASA%27s_Perseverance_Rover_Microphone_Captures_Sounds_from_Mars.ogg",
        "filename": "perseverance_mars.ogg",
    },
    "perseverance_laser": {
        "title": "File:First acoustic recording of laser shots on Mars.oga",
        "credit": "NASA/JPL-Caltech/LANL/CNES/CNRS/ISAE-Supaero",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "Perseverance SuperCam laser ablation acoustic pulses on Mars",
        "url": "https://upload.wikimedia.org/wikipedia/commons/3/30/First_acoustic_recording_of_laser_shots_on_Mars.oga",
        "commons_url": "https://commons.wikimedia.org/wiki/File:First_acoustic_recording_of_laser_shots_on_Mars.oga",
        "filename": "perseverance_laser.oga",
    },
    "insight_seismic": {
        "title": "File:07-Mars sound1a 20s x100.wav",
        "credit": "NASA/JPL-Caltech",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "InSight Mars seismometer/pressure sensor low-frequency rumble",
        "url": "https://upload.wikimedia.org/wikipedia/commons/d/dc/07-Mars_sound1a_20s_x100.wav",
        "commons_url": "https://commons.wikimedia.org/wiki/File:07-Mars_sound1a_20s_x100.wav",
        "filename": "insight_seismic.wav",
    },
    "sls_fire": {
        "title": "File:SLS Test Fire.mp3",
        "credit": "NASA",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "NASA Space Launch System booster static test fire",
        "url": "https://upload.wikimedia.org/wikipedia/commons/2/2c/SLS_Test_Fire.mp3",
        "commons_url": "https://commons.wikimedia.org/wiki/File:SLS_Test_Fire.mp3",
        "filename": "sls_test_fire.mp3",
    },
    "quindar_1": {
        "title": "File:Quindar - Sound (1).mp3",
        "credit": "NASA",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "NASA Apollo/Gemini Quindar mission radio tone 1",
        "url": "https://upload.wikimedia.org/wikipedia/commons/4/45/Quindar_-_Sound_%281%29.mp3",
        "commons_url": "https://commons.wikimedia.org/wiki/File:Quindar_-_Sound_(1).mp3",
        "filename": "quindar_1.mp3",
    },
    "quindar_2": {
        "title": "File:Quindar - Sound (2).mp3",
        "credit": "NASA",
        "license": "Public domain (PD-USGov-NASA)",
        "description": "NASA Apollo/Gemini Quindar mission radio tone 2",
        "url": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Quindar_-_Sound_%282%29.mp3",
        "commons_url": "https://commons.wikimedia.org/wiki/File:Quindar_-_Sound_(2).mp3",
        "filename": "quindar_2.mp3",
    },
}


def run_cmd(args: list[str]) -> str:
    res = subprocess.run(args, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Command failed ({res.returncode}): {' '.join(args)}\n{res.stderr}")
    return res.stdout


def download_file(url: str, dst: Path) -> None:
    if dst.exists() and dst.stat().st_size > 256:
        return
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=45) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status} for {url}")
                data = resp.read()
            if len(data) < 256:
                raise RuntimeError(f"Too small ({len(data)} bytes) for {url}")
            dst.write_bytes(data)
            return
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"Failed downloading {url}: {last_err}")


def decode_to_stereo(src_path: Path, tmp_dir: Path, target_sr: int = SR) -> np.ndarray:
    wav_path = tmp_dir / f"{src_path.stem}_{target_sr}.wav"
    run_cmd([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src_path), "-ac", "2", "-ar", str(target_sr), "-f", "wav", str(wav_path),
    ])
    audio, sr = sf.read(str(wav_path), always_2d=True, dtype="float32")
    if sr != target_sr:
        raise RuntimeError(f"Unexpected sample rate {sr} for {src_path}")
    return audio.astype(np.float32)


def dc_remove(x: np.ndarray, sr: int = SR) -> np.ndarray:
    y = x - np.mean(x, axis=0, keepdims=True)
    if len(y) > 64:
        sos = signal.butter(2, 18.0, btype="highpass", fs=sr, output="sos")
        y = signal.sosfiltfilt(sos, y, axis=0)
    return y.astype(np.float32)


def filter_audio(x: np.ndarray, lo_hz: float | None, hi_hz: float | None, sr: int = SR, order: int = 4) -> np.ndarray:
    y = x.astype(np.float64, copy=True)
    nyq = sr * 0.49
    if lo_hz is not None and lo_hz > 1.0:
        sos_hp = signal.butter(order, min(lo_hz, nyq * 0.9), btype="highpass", fs=sr, output="sos")
        y = signal.sosfiltfilt(sos_hp, y, axis=0)
    if hi_hz is not None and hi_hz < nyq:
        sos_lp = signal.butter(order, hi_hz, btype="lowpass", fs=sr, output="sos")
        y = signal.sosfiltfilt(sos_lp, y, axis=0)
    return y.astype(np.float32)


def stereo_widen(x: np.ndarray, width: float = 1.2) -> np.ndarray:
    mid = 0.5 * (x[:, 0] + x[:, 1])
    side = 0.5 * (x[:, 0] - x[:, 1]) * width
    return np.stack([mid + side, mid - side], axis=1).astype(np.float32)


def pitch_shift_stereo(x: np.ndarray, n_steps: float, sr: int = SR) -> np.ndarray:
    chans = []
    for c in range(x.shape[1]):
        chans.append(librosa.effects.pitch_shift(x[:, c].astype(np.float32), sr=sr, n_steps=n_steps))
    n = min(len(ch) for ch in chans)
    return np.stack([ch[:n] for ch in chans], axis=1).astype(np.float32)


def normalize_rms_peak(x: np.ndarray, target_rms_db: float = -14.0, max_peak_db: float = -1.5) -> np.ndarray:
    y = dc_remove(x)
    rms = float(np.sqrt(np.mean(y * y)))
    if rms > 1e-8:
        target_rms = 10.0 ** (target_rms_db / 20.0)
        y = y * (target_rms / rms)
    max_peak = 10.0 ** (max_peak_db / 20.0)
    peak = float(np.max(np.abs(y)))
    if peak > max_peak:
        y = np.tanh(y * (max_peak / peak) * 1.15) / np.tanh(1.15) * max_peak
    return y.astype(np.float32)


def normalize_peak(x: np.ndarray, max_peak_db: float = -1.5) -> np.ndarray:
    y = x - np.mean(x, axis=0, keepdims=True)
    peak = float(np.max(np.abs(y)))
    max_peak = 10.0 ** (max_peak_db / 20.0)
    if peak > 1e-8:
        y = y * (max_peak / peak)
    return y.astype(np.float32)


def apply_fades(x: np.ndarray, fade_in_ms: float, fade_out_ms: float, sr: int = SR) -> np.ndarray:
    y = x.copy()
    fi = min(len(y) // 2, int(round(sr * fade_in_ms / 1000.0)))
    fo = min(len(y) // 2, int(round(sr * fade_out_ms / 1000.0)))
    if fi > 1:
        y[:fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)[:, None]
    if fo > 1:
        y[-fo:] *= np.linspace(1.0, 0.0, fo, dtype=np.float32)[:, None]
    return y


def pick_energetic_segment(x: np.ndarray, need_samples: int, sr: int = SR) -> np.ndarray:
    edge = min(len(x) // 6, int(0.25 * sr))
    core = x[edge:len(x) - edge] if len(x) > 2 * edge + 256 else x
    while len(core) < need_samples + int(0.5 * sr):
        xf = min(len(core) // 3, int(0.35 * sr))
        if xf < 64:
            core = np.concatenate([core, core[::-1]], axis=0)
            continue
        t = np.linspace(0.0, np.pi * 0.5, xf, dtype=np.float32)[:, None]
        rev = core[::-1].copy()
        rev[:, [0, 1]] = rev[:, [1, 0]]
        blend = core[-xf:] * np.cos(t) + rev[:xf] * np.sin(t)
        core = np.concatenate([core[:-xf], blend, rev[xf:]], axis=0)

    hop = max(256, sr // 16)
    win = need_samples
    best_idx = 0
    best_score = -1.0
    for i in range(0, len(core) - win + 1, hop):
        sl = core[i:i + win]
        rms = float(np.sqrt(np.mean(sl * sl)))
        sub_rms = np.sqrt(np.mean(sl[: (win // 4) * 4].reshape(4, -1, 2) ** 2, axis=(1, 2)))
        stability = float(np.min(sub_rms) / (np.max(sub_rms) + 1e-6))
        score = rms * (0.4 + 0.6 * stability)
        if score > best_score:
            best_score = score
            best_idx = i
    return core[best_idx:best_idx + win].copy()


def make_periodic_loop(
    audio: np.ndarray,
    period_sec: float,
    fade_sec: float = 1.8,
    pad_sec: float = LOOP_PAD_SEC,
    target_rms_db: float = -13.5,
    sr: int = SR,
) -> np.ndarray:
    p = int(round(period_sec * sr))
    f = int(round(fade_sec * sr))
    seg = pick_energetic_segment(dc_remove(audio, sr), p + f, sr=sr)
    loop = seg[:p].copy()
    theta = np.linspace(0.0, np.pi * 0.5, f, dtype=np.float32)[:, None]
    loop[:f] = seg[:f] * np.sin(theta) + seg[p:p + f] * np.cos(theta)
    loop = normalize_rms_peak(loop, target_rms_db=target_rms_db, max_peak_db=-1.5)
    pad = int(round(pad_sec * sr))
    padded = np.concatenate([loop[p - pad:p], loop, loop[:pad]], axis=0)
    return padded.astype(np.float32)


def find_tone_burst(x: np.ndarray, lo_hz: float, hi_hz: float, pre_ms: float, dur_ms: float, sr: int = SR) -> np.ndarray:
    bp = filter_audio(x, lo_hz, hi_hz, sr=sr, order=4)
    mono_sq = np.mean(bp * bp, axis=1)
    k = max(32, int(0.08 * sr))
    kernel = np.ones(k, dtype=np.float32) / float(k)
    env = np.convolve(mono_sq, kernel, mode="same")
    peak_idx = int(np.argmax(env))
    pre = int(round(pre_ms * sr / 1000.0))
    dur = int(round(dur_ms * sr / 1000.0))
    start = max(0, peak_idx - pre)
    if start + dur > len(x):
        start = max(0, len(x) - dur)
    out = x[start:start + dur].copy()
    if len(out) < dur:
        out = np.pad(out, ((0, dur - len(out)), (0, 0)))
    return apply_fades(out, 6.0, 28.0, sr=sr)


def find_peak_slice(x: np.ndarray, pre_ms: float, dur_ms: float, sr: int = SR, skip_start_ms: float = 0.0) -> np.ndarray:
    skip = int(round(skip_start_ms * sr / 1000.0))
    sub = x[skip:] if skip < len(x) // 2 else x
    mag = np.max(np.abs(sub), axis=1)
    peak_idx = int(np.argmax(mag)) + (skip if skip < len(x) // 2 else 0)
    pre = int(round(pre_ms * sr / 1000.0))
    dur = int(round(dur_ms * sr / 1000.0))
    start = max(0, peak_idx - pre)
    if start + dur > len(x):
        start = max(0, len(x) - dur)
    out = x[start:start + dur].copy()
    if len(out) < dur:
        out = np.pad(out, ((0, dur - len(out)), (0, 0)))
    return out


def pad_or_trim(x: np.ndarray, target_len: int) -> np.ndarray:
    if len(x) == target_len:
        return x
    if len(x) > target_len:
        return x[:target_len].copy()
    return np.pad(x, ((0, target_len - len(x)), (0, 0))).astype(np.float32)


def encode_mp3(audio: np.ndarray, out_path: Path, tmp_dir: Path, bitrate: str = "96k", sr: int = SR) -> float:
    tmp_wav = tmp_dir / f"{out_path.stem}_enc.wav"
    sf.write(str(tmp_wav), audio.astype(np.float32), sr, subtype="PCM_16")
    run_cmd([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(tmp_wav), "-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(sr), str(out_path),
    ])
    chk_wav = tmp_dir / f"{out_path.stem}_chk.wav"
    run_cmd([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(out_path), "-f", "wav", str(chk_wav),
    ])
    dec, dec_sr = sf.read(str(chk_wav), always_2d=True, dtype="float32")
    return round(len(dec) / float(dec_sr), 4)


def encode_wav(audio: np.ndarray, out_path: Path, sr: int = IR_SR) -> float:
    sf.write(str(out_path), audio.astype(np.float32), sr, subtype="PCM_16")
    return round(len(audio) / float(sr), 4)


def _locked_freq(hz: float, period_sec: float = 24.0) -> float:
    return round(hz * period_sec) / period_sec


def convolve_linear(sig: np.ndarray, ir_24k: np.ndarray, wet: float = 0.30, sr: int = SR) -> np.ndarray:
    ir_48 = librosa.resample(ir_24k.T, orig_sr=IR_SR, target_sr=sr).T.astype(np.float64)
    n = len(sig)
    out = np.zeros((n, 2), dtype=np.float64)
    for ch in range(2):
        conv = signal.fftconvolve(sig[:, ch].astype(np.float64), ir_48[:, ch], mode="full")
        out[:, ch] = conv[:n]
    dry_rms = float(np.sqrt(np.mean(sig * sig))) + 1e-8
    wet_rms = float(np.sqrt(np.mean(out * out))) + 1e-8
    out_scaled = out * (dry_rms / wet_rms)
    return ((1.0 - wet) * sig.astype(np.float64) + wet * out_scaled).astype(np.float32)


def convolve_circular(sig: np.ndarray, ir_24k: np.ndarray, wet: float = 0.30, sr: int = SR) -> np.ndarray:
    ir_48 = librosa.resample(ir_24k.T, orig_sr=IR_SR, target_sr=sr).T.astype(np.float64)
    n = len(sig)
    out = np.zeros((n, 2), dtype=np.float64)
    for ch in range(2):
        h = np.zeros(n, dtype=np.float64)
        m = min(n, len(ir_48))
        h[:m] = ir_48[:m, ch]
        out[:, ch] = np.fft.irfft(np.fft.rfft(sig[:, ch].astype(np.float64)) * np.fft.rfft(h), n=n)
    dry_rms = float(np.sqrt(np.mean(sig * sig))) + 1e-8
    wet_rms = float(np.sqrt(np.mean(out * out))) + 1e-8
    out_scaled = out * (dry_rms / wet_rms)
    return ((1.0 - wet) * sig.astype(np.float64) + wet * out_scaled).astype(np.float32)


def _analog_pad_voice(t: np.ndarray, freq_hz: float, period_sec: float, detune_cycles: int, amp: float, sr: int = SR) -> np.ndarray:
    f_l = _locked_freq(freq_hz, period_sec) + detune_cycles / period_sec
    f_r = _locked_freq(freq_hz, period_sec) - detune_cycles / period_sec
    nyq_cap = sr * 0.42
    harm_weights = [(1.0, 1.0, 0.0, 0.55), (2.0, 0.42, 0.4, 1.0), (3.0, 0.24, 0.9, 1.5), (4.0, 0.12, 1.4, 2.0), (5.0, 0.06, 1.9, 2.5)]
    w_l = np.zeros_like(t, dtype=np.float64)
    w_r = np.zeros_like(t, dtype=np.float64)
    for h_mul, h_amp, p_l, p_r in harm_weights:
        if h_mul * f_l < nyq_cap:
            w_l += h_amp * np.sin(2.0 * np.pi * (h_mul * f_l) * t + p_l)
        if h_mul * f_r < nyq_cap:
            w_r += h_amp * np.sin(2.0 * np.pi * (h_mul * f_r) * t + p_r)
    return np.stack([w_l, w_r], axis=1) * (amp * 0.72)


def _chord_window(t: np.ndarray, start_s: float, dur_s: float, period_sec: float, xfade_s: float = 1.8) -> np.ndarray:
    u = np.mod(t - start_s, period_sec)
    env = np.zeros_like(t, dtype=np.float64)
    in_mask = u < xfade_s
    sus_mask = (u >= xfade_s) & (u < dur_s)
    out_mask = (u >= dur_s) & (u < dur_s + xfade_s)
    env[in_mask] = np.sin(0.5 * np.pi * u[in_mask] / xfade_s)
    env[sus_mask] = 1.0
    env[out_mask] = np.cos(0.5 * np.pi * (u[out_mask] - dur_s) / xfade_s)
    return env


def _add_circular_mono(buf: np.ndarray, onset_sec: float, mono: np.ndarray, pan: float, sr: int = SR) -> None:
    n_total = len(buf)
    m = len(mono)
    p = float(np.clip(pan, -0.95, 0.95))
    g_l = np.sqrt(0.5 * (1.0 - p))
    g_r = np.sqrt(0.5 * (1.0 + p))
    start = int(round(onset_sec * sr)) % n_total
    idx = (np.arange(m) + start) % n_total
    buf[idx, 0] += mono * g_l
    buf[idx, 1] += mono * g_r


def _add_rhodes_note(buf: np.ndarray, onset_sec: float, freq_hz: float, dur_sec: float, pan: float, amp: float, sr: int = SR) -> None:
    m = int(round(dur_sec * sr))
    tt = np.arange(m, dtype=np.float64) / float(sr)
    att = np.clip(tt / 0.008, 0.0, 1.0)
    body = att * np.exp(-tt / (dur_sec * 0.34))
    tine = att * np.exp(-tt / 0.085)
    tone = (
        np.sin(2.0 * np.pi * freq_hz * tt) * body
        + 0.28 * np.sin(2.0 * np.pi * 2.0 * freq_hz * tt + 0.2) * body
        + 0.14 * np.sin(2.0 * np.pi * 3.0 * freq_hz * tt) * np.exp(-tt / 0.22)
        + 0.22 * np.sin(2.0 * np.pi * 7.0 * freq_hz * tt) * tine
    ) * amp
    _add_circular_mono(buf, onset_sec, tone, pan, sr=sr)
    _add_circular_mono(buf, onset_sec + 0.75, tone * 0.34, -pan * 0.85, sr=sr)
    _add_circular_mono(buf, onset_sec + 1.50, tone * 0.16, pan * 0.70, sr=sr)


def _add_glass_swell(buf: np.ndarray, onset_sec: float, freq_hz: float, dur_sec: float, pan: float, amp: float, sr: int = SR) -> None:
    m = int(round(dur_sec * sr))
    tt = np.arange(m, dtype=np.float64) / float(sr)
    att_s = 0.42
    att = np.where(tt < att_s, 0.5 * (1.0 - np.cos(np.pi * tt / att_s)), 1.0)
    rel = np.exp(-np.maximum(0.0, tt - att_s * 0.6) / (dur_sec * 0.36))
    env = att * rel
    tone = (
        np.sin(2.0 * np.pi * freq_hz * tt)
        + 0.26 * np.sin(2.0 * np.pi * 2.0 * freq_hz * tt + 0.3)
        + 0.10 * np.sin(2.0 * np.pi * 3.0 * freq_hz * tt + 0.7)
        + 0.06 * np.sin(2.0 * np.pi * 4.0 * freq_hz * tt + 1.1)
    ) * env * amp
    _add_circular_mono(buf, onset_sec, tone, pan, sr=sr)
    _add_circular_mono(buf, onset_sec + 1.0, tone * 0.28, -pan * 0.80, sr=sr)


def _decorrelate_broadband(src: np.ndarray, seed: int) -> np.ndarray:
    n = len(src)
    rng = np.random.default_rng(seed)
    fft_n = 1 << int(np.ceil(np.log2(n)))
    out = np.zeros((n, 2), dtype=np.float64)
    kernel = np.ones(33, dtype=np.float64) / 33.0
    for ch in range(2):
        mag = np.abs(np.fft.rfft(src[:, ch].astype(np.float64), n=fft_n))
        mag_smooth = np.convolve(mag, kernel, mode="same")
        phases = rng.uniform(-np.pi, np.pi, size=mag_smooth.shape)
        phases[0] = 0.0
        out[:, ch] = np.fft.irfft(mag_smooth * np.exp(1j * phases), n=fft_n)[:n]
    return out.astype(np.float32)


def build_space_music(
    ir_24k: np.ndarray,
    mode: str,
    period_sec: float = 32.0,
    raw: dict[str, np.ndarray] | None = None,
    sr: int = SR,
) -> np.ndarray:
    n = int(round(period_sec * sr))
    t = np.arange(n, dtype=np.float64) / float(sr)
    pad = np.zeros((n, 2), dtype=np.float64)
    melody = np.zeros((n, 2), dtype=np.float64)

    if mode == "orbital":
        # D Dorian 4-chord progression (Dm9 -> G13/Cmaj7 -> Bbmaj7#11 -> Asus4/C6)
        pedal_env = 0.78 + 0.22 * np.cos(2.0 * np.pi * t / period_sec)
        bass = (_analog_pad_voice(t, 73.42, period_sec, 1, 0.24, sr) + _analog_pad_voice(t, 110.00, period_sec, 1, 0.14, sr)) * pedal_env[:, None]
        chords = [
            (0.0, [146.83, 220.00, 261.63, 329.63, 349.23]),
            (8.0, [98.00, 146.83, 246.94, 329.63, 440.00]),
            (16.0, [116.54, 174.61, 220.00, 293.66, 329.63]),
            (24.0, [110.00, 164.81, 196.00, 261.63, 293.66]),
        ]
        for start_s, freqs in chords:
            w = _chord_window(t, start_s, 8.0, period_sec, xfade_s=1.8)[:, None]
            chord_sig = np.zeros((n, 2), dtype=np.float64)
            for idx_f, hz in enumerate(freqs):
                chord_sig += _analog_pad_voice(t, hz, period_sec, 1 + (idx_f % 3), 0.16 - 0.018 * idx_f, sr)
            pad += chord_sig * w
        pad += bass
        motif = [
            (0.5, 587.33, 2.2, -0.35), (2.5, 440.00, 2.0, 0.30), (4.5, 523.25, 2.2, -0.25), (6.5, 659.25, 2.4, 0.35),
            (8.5, 587.33, 2.2, -0.30), (10.5, 493.88, 2.0, 0.32), (12.5, 440.00, 2.2, -0.28), (14.5, 392.00, 2.2, 0.25),
            (16.5, 587.33, 2.2, -0.35), (18.5, 523.25, 2.0, 0.30), (20.5, 440.00, 2.2, -0.30), (22.5, 659.25, 2.4, 0.38),
            (24.5, 523.25, 2.2, -0.28), (26.5, 440.00, 2.0, 0.32), (28.5, 392.00, 2.2, -0.25), (30.5, 349.23, 2.4, 0.28),
        ]
        for onset, hz, dur, pan in motif:
            _add_rhodes_note(melody, onset, hz, dur, pan, 0.125, sr=sr)

        pad_low = filter_audio(pad.astype(np.float32), 26.0, 650.0, sr=sr, order=3)
        pad_hi = filter_audio(pad.astype(np.float32), 420.0, 2400.0, sr=sr, order=3)
        sweep = (0.40 + 0.60 * (0.5 - 0.5 * np.cos(2.0 * np.pi * t / period_sec)))[:, None].astype(np.float32)
        pad_warm = pad_low + 0.85 * pad_hi * sweep
        pad_verb = convolve_circular(pad_warm, ir_24k, wet=0.30, sr=sr)
        mel_verb = convolve_circular(melody.astype(np.float32), ir_24k, wet=0.40, sr=sr)
        mix = normalize_rms_peak(pad_verb + 0.88 * mel_verb, target_rms_db=-15.2, max_peak_db=-1.5)

    elif mode == "interstellar":
        # A Lydian cathedral 4-chord progression (Amaj9#11 -> B6/9 -> F#m11 -> Dmaj7#11/E6)
        drone_shimmer = 0.84 + 0.16 * np.sin(2.0 * np.pi * 0.5 * t)
        bass = _analog_pad_voice(t, 55.00, period_sec, 1, 0.25, sr) + _analog_pad_voice(t, 82.41, period_sec, 1, 0.16, sr)
        chords = [
            (0.0, [110.00, 164.81, 207.65, 246.94, 277.18, 311.13]),
            (8.0, [123.47, 185.00, 207.65, 277.18, 311.13, 369.99]),
            (16.0, [92.50, 138.59, 220.00, 246.94, 329.63, 415.30]),
            (24.0, [82.41, 146.83, 185.00, 207.65, 277.18, 440.00]),
        ]
        for start_s, freqs in chords:
            w = _chord_window(t, start_s, 8.0, period_sec, xfade_s=1.8)[:, None]
            chord_sig = np.zeros((n, 2), dtype=np.float64)
            for idx_f, hz in enumerate(freqs):
                chord_sig += _analog_pad_voice(t, hz, period_sec, 1 + (idx_f % 3), 0.145 - 0.015 * idx_f, sr)
            pad += chord_sig * w
        pad += bass
        swells = [
            (0.8, 440.00, 3.2, 0.30), (4.0, 622.25, 3.4, -0.35), (7.6, 554.37, 3.0, 0.28),
            (10.8, 659.25, 3.2, -0.32), (14.0, 493.88, 3.0, 0.34), (17.2, 622.25, 3.4, -0.30),
            (20.6, 415.30, 3.2, 0.28), (23.8, 554.37, 3.4, -0.36), (27.2, 659.25, 3.0, 0.32),
            (29.8, 493.88, 2.8, -0.24),
        ]
        for onset, hz, dur, pan in swells:
            _add_glass_swell(melody, onset, hz, dur, pan, 0.125, sr=sr)

        pad_low = filter_audio(pad.astype(np.float32), 26.0, 650.0, sr=sr, order=3)
        pad_hi = filter_audio(pad.astype(np.float32), 420.0, 2400.0, sr=sr, order=3)
        sweep = (0.40 + 0.60 * (0.5 - 0.5 * np.cos(2.0 * np.pi * t / period_sec)))[:, None].astype(np.float32)
        pad_warm = pad_low + pad_hi * sweep * drone_shimmer[:, None].astype(np.float32)
        pad_verb = convolve_circular(pad_warm, ir_24k, wet=0.34, sr=sr)
        mel_verb = convolve_circular(melody.astype(np.float32), ir_24k, wet=0.45, sr=sr)
        mix = normalize_rms_peak(pad_verb + 0.85 * mel_verb, target_rms_db=-15.2, max_peak_db=-1.5)

    else:
        # Tactical combat tension track: 120 BPM (24.0s = 48 beats) D Phrygian / minor
        # Pulsing synth bassline (D2-D2-Eb2-D2-F2-D2-C2-Bb1) + dark swells + NASA percussion hits
        chords = [
            (0.0, [146.83, 220.00, 261.63, 349.23]),
            (6.0, [155.56, 220.00, 293.66, 392.00]),
            (12.0, [130.81, 196.00, 261.63, 311.13]),
            (18.0, [110.00, 174.61, 220.00, 277.18]),
        ]
        for start_s, freqs in chords:
            w = _chord_window(t, start_s, 6.0, period_sec, xfade_s=1.2)[:, None]
            chord_sig = np.zeros((n, 2), dtype=np.float64)
            for idx_f, hz in enumerate(freqs):
                chord_sig += _analog_pad_voice(t, hz, period_sec, 1 + (idx_f % 2), 0.14 - 0.015 * idx_f, sr)
            pad += chord_sig * w

        step_s = 0.25  # 8th note at 120 BPM
        bass_pattern = [73.42, 73.42, 77.78, 73.42, 87.31, 73.42, 65.41, 58.27]
        bass_layer = np.zeros((n, 2), dtype=np.float64)
        for st_idx in range(int(round(period_sec / step_s))):
            f_bass = _locked_freq(bass_pattern[st_idx % len(bass_pattern)], period_sec)
            dur_step = 0.23
            m_b = int(round(dur_step * sr))
            tt_b = np.arange(m_b, dtype=np.float64) / float(sr)
            env_b = np.clip(tt_b / 0.005, 0.0, 1.0) * np.exp(-tt_b / 0.11)
            accent = 1.15 if (st_idx % 4 == 0) else 0.85
            wave_b = (
                np.sin(2.0 * np.pi * f_bass * tt_b)
                + 0.45 * np.sin(2.0 * np.pi * 2.0 * f_bass * tt_b + 0.1) * np.exp(-tt_b / 0.08)
                + 0.20 * np.sin(2.0 * np.pi * 3.0 * f_bass * tt_b) * np.exp(-tt_b / 0.05)
            ) * env_b * 0.24 * accent
            _add_circular_mono(bass_layer, st_idx * step_s, wave_b, (0.08 if st_idx % 2 == 0 else -0.08), sr=sr)

        perc = np.zeros((n, 2), dtype=np.float64)
        if raw and "sls_fire" in raw and "perseverance_laser" in raw:
            kick_raw = filter_audio(pick_energetic_segment(raw["sls_fire"], int(0.24 * sr), sr), 28.0, 210.0, sr=sr)
            kick_mono = np.mean(normalize_peak(kick_raw, -2.0), axis=1).astype(np.float64)
            tk = np.arange(len(kick_mono), dtype=np.float64) / float(sr)
            kick_mono *= np.clip(tk / 0.003, 0.0, 1.0) * np.exp(-tk / 0.075) * 0.42

            tick_raw = filter_audio(find_peak_slice(raw["perseverance_laser"], 2.0, 95.0, sr), 1800.0, 8500.0, sr=sr)
            tick_mono = np.mean(normalize_peak(tick_raw, -3.0), axis=1).astype(np.float64)
            tt_k = np.arange(len(tick_mono), dtype=np.float64) / float(sr)
            tick_mono *= np.clip(tt_k / 0.002, 0.0, 1.0) * np.exp(-tt_k / 0.032) * 0.20

            beat_s = 0.50
            for b_idx in range(int(round(period_sec / beat_s))):
                if b_idx % 2 == 0:
                    _add_circular_mono(perc, b_idx * beat_s, kick_mono, 0.0, sr=sr)
                else:
                    _add_circular_mono(perc, b_idx * beat_s, tick_mono * 1.15, 0.14, sr=sr)
                _add_circular_mono(perc, b_idx * beat_s + 0.25, tick_mono * 0.72, -0.18, sr=sr)

        pad_warm = filter_audio(pad.astype(np.float32), 28.0, 1900.0, sr=sr, order=3)
        pad_verb = convolve_circular(pad_warm, ir_24k, wet=0.18, sr=sr)
        mix = normalize_rms_peak(
            pad_verb + bass_layer.astype(np.float32) + perc.astype(np.float32),
            target_rms_db=-14.0,
            max_peak_db=-1.4,
        )

    pad_samples = int(round(LOOP_PAD_SEC * sr))
    return np.concatenate([mix[n - pad_samples:n], mix, mix[:pad_samples]], axis=0).astype(np.float32)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def build_hull_ir(raw: dict[str, np.ndarray], tmp_dir: Path) -> np.ndarray:
    """Create a 2.0s 24kHz ice-cathedral hull impulse response from NASA spectra."""
    dur_s = 2.0
    n = int(round(dur_s * IR_SR))
    sls = librosa.resample(raw["sls_fire"].T, orig_sr=SR, target_sr=IR_SR).T
    sat = librosa.resample(raw["saturn_rpws_1"].T, orig_sr=SR, target_sr=IR_SR).T
    per = librosa.resample(raw["perseverance_cruise"].T, orig_sr=SR, target_sr=IR_SR).T

    seg_a = pick_energetic_segment(sls, n, sr=IR_SR)
    seg_b = pick_energetic_segment(sat, n, sr=IR_SR)
    seg_c = pick_energetic_segment(per, n, sr=IR_SR)

    rng = np.random.default_rng(1337)
    blend_src = 0.50 * seg_a + 0.30 * seg_b + 0.20 * seg_c
    # Preserve spectral shape from NASA sources with smooth decorrelated diffuse phases
    fft_n = 1 << int(np.ceil(np.log2(n)))
    diffuse = np.zeros((n, 2), dtype=np.float64)
    for ch in range(2):
        mag = np.abs(np.fft.rfft(blend_src[:, ch], n=fft_n))
        mag_smooth = np.convolve(mag, np.ones(17) / 17.0, mode="same")
        phases = rng.uniform(-np.pi, np.pi, size=mag_smooth.shape)
        phases[0] = 0.0
        spec = mag_smooth * np.exp(1j * phases)
        diffuse[:, ch] = np.fft.irfft(spec, n=fft_n)[:n]

    diffuse = diffuse / (np.max(np.abs(diffuse)) + 1e-8)
    t = np.arange(n, dtype=np.float64) / float(IR_SR)
    low_band = filter_audio(diffuse.astype(np.float32), 45.0, 1800.0, sr=IR_SR, order=3).astype(np.float64)
    hi_band = filter_audio(diffuse.astype(np.float32), 1800.0, 9500.0, sr=IR_SR, order=3).astype(np.float64)

    env_low = np.exp(-6.9077 * t / 1.85)
    env_hi = np.exp(-6.9077 * t / 0.58)
    ir = low_band * env_low[:, None] * 0.85 + hi_band * env_hi[:, None] * 0.45

    # Early metallic hull reflection taps seeded from Perseverance transient texture
    tap_ms = [14.0, 29.0, 47.0, 73.0]
    tap_gain = [0.42, 0.31, 0.22, 0.15]
    pulse_slice = filter_audio(find_peak_slice(raw["perseverance_cruise"], 2.0, 20.0, SR), 120.0, 4200.0, SR)
    pulse_24 = librosa.resample(pulse_slice.T, orig_sr=SR, target_sr=IR_SR).T
    pulse_24 = normalize_peak(pulse_24, max_peak_db=-3.0)
    for idx_t, (ms, g) in enumerate(zip(tap_ms, tap_gain)):
        pos = int(round(ms * IR_SR / 1000.0))
        end = min(n, pos + len(pulse_24))
        w = end - pos
        if w > 0:
            pan = np.array([1.0 - 0.12 * ((idx_t % 2) * 2 - 1), 1.0 + 0.12 * ((idx_t % 2) * 2 - 1)])
            ir[pos:end] += pulse_24[:w] * g * pan[None, :]

    # Keep direct impulse spike minimal so dry/wet bus controls balance cleanly
    ir = apply_fades(ir.astype(np.float32), 6.0, 140.0, sr=IR_SR)
    rms = float(np.sqrt(np.mean(ir * ir)))
    if rms > 1e-8:
        ir = ir * (0.042 / rms)
    peak = float(np.max(np.abs(ir)))
    if peak > 0.72:
        ir = ir * (0.72 / peak)
    return ir.astype(np.float32)


def build_all(output_dir: Path, keep_raw: bool = False, raw_dir_arg: str | None = None) -> dict[str, Any]:
    stems_dir = output_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)

    created_tmp = False
    if raw_dir_arg:
        raw_dir = Path(raw_dir_arg)
        raw_dir.mkdir(parents=True, exist_ok=True)
    else:
        raw_dir = Path(tempfile.mkdtemp(prefix="lh_nasa_raw_"))
        created_tmp = True

    decode_tmp = Path(tempfile.mkdtemp(prefix="lh_nasa_dec_"))
    try:
        decoded: dict[str, np.ndarray] = {}
        keys = list(SOURCES.keys())
        for idx, key in enumerate(keys):
            info = SOURCES[key]
            dst = raw_dir / info["filename"]
            print(f"[{idx + 1}/{len(keys)}] Fetching {key} ({info['title']})...")
            download_file(info["url"], dst)
            decoded[key] = decode_to_stereo(dst, decode_tmp, SR)
            if idx < len(keys) - 1:
                time.sleep(0.4)

        specs = [
            ("music-orbital", "music", "music-orbital.mp3", 32.0, ["sls_fire", "saturn_rpws_1", "perseverance_cruise"]),
            ("music-interstellar", "music", "music-interstellar.mp3", 32.0, ["sls_fire", "saturn_rpws_1", "perseverance_cruise"]),
            ("music-combat", "music", "music-combat.mp3", 24.0, ["sls_fire", "perseverance_laser", "saturn_rpws_1"]),
            ("bed-cabin", "loop", "bed-cabin.mp3", 12.0, ["perseverance_cruise", "insight_seismic"]),
            ("bed-planetary", "loop", "bed-planetary.mp3", 14.0, ["saturn_rpws_2", "saturn_rpws_1"]),
            ("bed-interstellar", "loop", "bed-interstellar.mp3", 14.0, ["jupiter_rpws", "earth_chorus"]),
            ("bed-sheath", "loop", "bed-sheath.mp3", 10.0, ["earth_chorus", "enceladus_rpws"]),
            ("stem-drive", "loop", "stem-drive.mp3", 10.0, ["sls_fire", "perseverance_cruise", "saturn_rpws_1"]),
            ("stem-rcs", "loop", "stem-rcs.mp3", 6.0, ["sls_fire", "perseverance_mars"]),
            ("stem-harvest", "loop", "stem-harvest.mp3", 8.0, ["perseverance_cruise", "enceladus_rpws"]),
            ("ir-hull", "ir", "ir-hull.wav", 2.0, ["sls_fire", "saturn_rpws_1", "perseverance_cruise"]),
            ("sfx-quindar-in", "sfx", "sfx-quindar-in.mp3", None, ["quindar_1"]),
            ("sfx-quindar-out", "sfx", "sfx-quindar-out.mp3", None, ["quindar_2"]),
            ("sfx-wpn-newtonian", "sfx", "sfx-wpn-newtonian.mp3", None, ["perseverance_laser", "sls_fire"]),
            ("sfx-wpn-relativistic", "sfx", "sfx-wpn-relativistic.mp3", None, ["perseverance_laser", "saturn_lightning", "sls_fire"]),
            ("sfx-dock-clunk", "sfx", "sfx-dock-clunk.mp3", None, ["sls_fire", "insight_seismic", "enceladus_rpws"]),
            ("sfx-impact", "sfx", "sfx-impact.mp3", None, ["saturn_lightning", "sls_fire"]),
            ("sfx-explosion", "sfx", "sfx-explosion.mp3", None, ["sls_fire", "saturn_lightning", "insight_seismic"]),
            ("sfx-ui-click", "sfx", "sfx-ui-click.mp3", None, ["perseverance_laser"]),
            ("sfx-ui-toggle", "sfx", "sfx-ui-toggle.mp3", None, ["perseverance_laser", "quindar_1"]),
            ("sfx-ui-tab", "sfx", "sfx-ui-tab.mp3", None, ["quindar_1", "perseverance_laser"]),
            ("sfx-ui-confirm", "sfx", "sfx-ui-confirm.mp3", None, ["quindar_2", "quindar_1", "perseverance_laser"]),
            ("sfx-ui-deny", "sfx", "sfx-ui-deny.mp3", None, ["perseverance_laser", "insight_seismic", "quindar_2"]),
            ("sfx-warn-caution", "sfx", "sfx-warn-caution.mp3", None, ["quindar_1"]),
            ("sfx-alarm", "sfx", "sfx-alarm.mp3", None, ["quindar_2", "earth_chorus"]),
        ]

        rendered: dict[str, np.ndarray] = {}

        # 0. ir-hull built first so ambient beds and music can convolve smoothly
        ir_hull = build_hull_ir(decoded, decode_tmp)
        rendered["ir-hull"] = ir_hull

        # 0b-0d. Original multi-chord space music + tactical combat pulse
        rendered["music-orbital"] = build_space_music(ir_hull, "orbital", period_sec=32.0, raw=decoded, sr=SR)
        rendered["music-interstellar"] = build_space_music(ir_hull, "interstellar", period_sec=32.0, raw=decoded, sr=SR)
        rendered["music-combat"] = build_space_music(ir_hull, "combat", period_sec=24.0, raw=decoded, sr=SR)

        # 1. bed-cabin: warm lowpassed cryo-hull pump + seismic floor rumble
        a1 = filter_audio(decoded["perseverance_cruise"], 26.0, 260.0, SR)
        b1 = filter_audio(decoded["insight_seismic"], 22.0, 180.0, SR)
        l1_a = pick_energetic_segment(a1, int(13.8 * SR), SR)
        l1_b = pick_energetic_segment(b1, int(13.8 * SR), SR)
        rendered["bed-cabin"] = make_periodic_loop(
            stereo_widen(0.68 * l1_a + 0.36 * l1_b, 1.08),
            12.0, 1.8, target_rms_db=-16.5,
        )

        # 2. bed-planetary: smoothed Saturn RPWS magnetospheric whisper with hull hall tail
        p2_a = pitch_shift_stereo(filter_audio(decoded["saturn_rpws_2"], 130.0, 2800.0, SR), -4.0, SR)
        p2_b = pitch_shift_stereo(filter_audio(decoded["saturn_rpws_1"], 130.0, 2600.0, SR), -4.0, SR)
        s2_a = pick_energetic_segment(filter_audio(p2_a, 130.0, 2200.0, SR), int(16.2 * SR), SR)
        s2_b = pick_energetic_segment(filter_audio(p2_b, 130.0, 2100.0, SR), int(16.2 * SR), SR)
        s2_mix = convolve_linear(stereo_widen(0.65 * s2_a + 0.35 * s2_b, 1.24), ir_hull, wet=0.30, sr=SR)
        rendered["bed-planetary"] = make_periodic_loop(s2_mix, 14.0, 2.0, target_rms_db=-16.5)

        # 3. bed-interstellar: smoothed Jupiter plasma & EMFISIS chorus with hull tail
        p3_a = pitch_shift_stereo(filter_audio(decoded["jupiter_rpws"], 130.0, 2900.0, SR), -5.0, SR)
        p3_b = pitch_shift_stereo(filter_audio(decoded["earth_chorus"], 140.0, 2700.0, SR), -5.0, SR)
        s3_a = pick_energetic_segment(filter_audio(p3_a, 130.0, 2400.0, SR), int(16.2 * SR), SR)
        s3_b = pick_energetic_segment(filter_audio(p3_b, 140.0, 2300.0, SR), int(16.2 * SR), SR)
        s3_mix = convolve_linear(stereo_widen(0.68 * s3_a + 0.32 * s3_b, 1.22), ir_hull, wet=0.32, sr=SR)
        rendered["bed-interstellar"] = make_periodic_loop(s3_mix, 14.0, 2.0, target_rms_db=-16.5)

        # 4. bed-sheath: smoothed Cherenkov relativistic bow-shock shimmer
        s4_a = pick_energetic_segment(filter_audio(decoded["earth_chorus"], 360.0, 4600.0, SR), int(12.2 * SR), SR)
        s4_b = pick_energetic_segment(filter_audio(decoded["enceladus_rpws"], 420.0, 4400.0, SR), int(12.2 * SR), SR)
        s4_mix = convolve_linear(stereo_widen(0.56 * s4_a + 0.44 * s4_b, 1.24), ir_hull, wet=0.28, sr=SR)
        rendered["bed-sheath"] = make_periodic_loop(s4_mix, 10.0, 1.8, target_rms_db=-16.0)

        # 5. stem-drive: deep SLS sub-bass torch drive + subtle harmonic shimmer
        d_sub = pick_energetic_segment(filter_audio(decoded["sls_fire"], 28.0, 540.0, SR), int(11.8 * SR), SR)
        d_mid = pick_energetic_segment(filter_audio(decoded["sls_fire"], 180.0, 1250.0, SR), int(11.8 * SR), SR)
        d_per = pick_energetic_segment(
            pitch_shift_stereo(filter_audio(decoded["perseverance_cruise"], 210.0, 1900.0, SR), 2.0, SR),
            int(11.8 * SR), SR,
        )
        d_sat = pick_energetic_segment(filter_audio(decoded["saturn_rpws_1"], 180.0, 1200.0, SR), int(11.8 * SR), SR)
        rendered["stem-drive"] = make_periodic_loop(
            0.78 * d_sub + 0.24 * d_mid + 0.12 * d_per + 0.08 * d_sat,
            10.0, 1.8, target_rms_db=-12.5,
        )

        # 6. stem-rcs: crisp broadband cold-gas nitrogen thruster hiss (decorrelated NASA nozzle spectra)
        r_hi = pick_energetic_segment(filter_audio(decoded["sls_fire"], 1400.0, 9200.0, SR), int(7.4 * SR), SR)
        r_valve = pick_energetic_segment(filter_audio(decoded["sls_fire"], 650.0, 1600.0, SR), int(7.4 * SR), SR)
        r_mars = pick_energetic_segment(filter_audio(decoded["perseverance_mars"], 2200.0, 7200.0, SR), int(7.4 * SR), SR)
        r_noise = _decorrelate_broadband(0.82 * r_hi + 0.16 * r_valve + 0.22 * r_mars, seed=2026)
        rendered["stem-rcs"] = make_periodic_loop(
            filter_audio(r_noise, 650.0, 9200.0, SR),
            6.0, 1.4, target_rms_db=-14.8,
        )

        # 7. stem-harvest: DropShip boring pump + subtle 1.5Hz LFO + icy fizz
        h_a = pick_energetic_segment(filter_audio(decoded["perseverance_cruise"], 85.0, 1400.0, SR), int(9.4 * SR), SR)
        h_b = pick_energetic_segment(filter_audio(decoded["enceladus_rpws"], 850.0, 5800.0, SR), int(9.4 * SR), SR)
        t_h = np.arange(len(h_a), dtype=np.float32)[:, None] / float(SR)
        lfo = 0.80 + 0.20 * np.sin(2.0 * np.pi * 1.5 * t_h)
        rendered["stem-harvest"] = make_periodic_loop(0.64 * h_a * lfo + 0.36 * h_b, 8.0, 1.4, target_rms_db=-14.5)

        # 9-10. Clean isolated Apollo Quindar intro / outro tones (220ms narrowband)
        q1 = find_tone_burst(decoded["quindar_1"], 2485.0, 2565.0, 12.0, 220.0, SR)
        q2 = find_tone_burst(decoded["quindar_2"], 2435.0, 2515.0, 12.0, 220.0, SR)
        rendered["sfx-quindar-in"] = apply_fades(normalize_peak(filter_audio(q1, 2400.0, 2660.0, SR), -2.5), 5.0, 25.0, SR)
        rendered["sfx-quindar-out"] = apply_fades(normalize_peak(filter_audio(q2, 2360.0, 2610.0, SR), -2.5), 5.0, 25.0, SR)

        # 11. sfx-wpn-newtonian: SuperCam laser crack + 160ms SLS rail thump
        las = normalize_peak(find_peak_slice(decoded["perseverance_laser"], 8.0, 750.0, SR), -1.8)
        thump_raw = normalize_peak(filter_audio(pick_energetic_segment(decoded["sls_fire"], int(0.18 * SR), SR), 28.0, 360.0, SR), -2.0)
        thump = apply_fades(pad_or_trim(thump_raw, len(las)), 2.0, 140.0, SR)
        tt = np.arange(len(las), dtype=np.float32)[:, None] / float(SR)
        thump *= np.exp(-tt / 0.08)
        rendered["sfx-wpn-newtonian"] = normalize_peak(0.74 * las + 0.56 * thump, -1.5)

        # 12. sfx-wpn-relativistic: laser transient + Saturn lightning + SLS sub drop
        len_r = int(1.35 * SR)
        las_r = pad_or_trim(normalize_peak(filter_audio(find_peak_slice(decoded["perseverance_laser"], 10.0, 550.0, SR), 180.0, 9500.0, SR), -1.5), len_r)
        lit_r = pad_or_trim(normalize_peak(filter_audio(find_peak_slice(decoded["saturn_lightning"], 20.0, 1200.0, SR), 250.0, 9500.0, SR), -2.0), len_r)
        sls_r = pad_or_trim(normalize_peak(filter_audio(pick_energetic_segment(decoded["sls_fire"], int(1.2 * SR), SR), 28.0, 320.0, SR), -2.0), len_r)
        tr = np.arange(len_r, dtype=np.float32)[:, None] / float(SR)
        env_sub = np.exp(-tr / 0.42)
        rendered["sfx-wpn-relativistic"] = apply_fades(normalize_peak(0.65 * las_r + 0.50 * lit_r + 0.62 * sls_r * env_sub, -1.5), 4.0, 180.0, SR)

        # 13. sfx-dock-clunk: mechanical impact + cold-gas seal vent
        len_d = int(0.95 * SR)
        d_imp = pad_or_trim(normalize_peak(filter_audio(find_peak_slice(decoded["sls_fire"], 6.0, 220.0, SR), 35.0, 900.0, SR), -1.5), len_d)
        d_sei = pad_or_trim(normalize_peak(filter_audio(pick_energetic_segment(decoded["insight_seismic"], int(0.45 * SR), SR), 24.0, 220.0, SR), -2.0), len_d)
        d_hiss = pad_or_trim(normalize_peak(filter_audio(pick_energetic_segment(decoded["enceladus_rpws"], int(0.55 * SR), SR), 950.0, 7500.0, SR), -3.5), len_d)
        td = np.arange(len_d, dtype=np.float32)[:, None] / float(SR)
        hiss_win = np.clip((td - 0.14) / 0.08, 0.0, 1.0) * np.exp(-np.maximum(0.0, td - 0.18) / 0.22)
        rendered["sfx-dock-clunk"] = apply_fades(
            normalize_peak(0.75 * d_imp * np.exp(-td / 0.14) + 0.45 * d_sei * np.exp(-td / 0.22) + 0.34 * d_hiss * hiss_win, -1.5),
            4.0, 110.0, SR,
        )

        # 14. sfx-impact: Saturn lightning crackle + hull crunch
        len_im = int(1.15 * SR)
        im_a = pad_or_trim(normalize_peak(find_peak_slice(decoded["saturn_lightning"], 12.0, 1050.0, SR), -1.5), len_im)
        im_b = pad_or_trim(normalize_peak(filter_audio(pick_energetic_segment(decoded["sls_fire"], int(0.9 * SR), SR), 30.0, 620.0, SR), -1.8), len_im)
        tim = np.arange(len_im, dtype=np.float32)[:, None] / float(SR)
        rendered["sfx-impact"] = apply_fades(normalize_peak(0.68 * im_a + 0.52 * im_b * np.exp(-tim / 0.36), -1.5), 4.0, 140.0, SR)

        # 14b. sfx-explosion: multi-stage plasma detonation + SLS sub shockwave + seismic hull shatter
        len_ex = int(1.75 * SR)
        ex_crack = pad_or_trim(normalize_peak(filter_audio(find_peak_slice(decoded["saturn_lightning"], 10.0, 520.0, SR), 180.0, 9500.0, SR), -1.2), len_ex)
        ex_boom = pad_or_trim(normalize_peak(filter_audio(pick_energetic_segment(decoded["sls_fire"], int(1.7 * SR), SR), 24.0, 380.0, SR), -1.2), len_ex)
        ex_sei = pad_or_trim(normalize_peak(filter_audio(pick_energetic_segment(decoded["insight_seismic"], int(1.5 * SR), SR), 22.0, 160.0, SR), -1.5), len_ex)
        ex_shatter = pad_or_trim(normalize_peak(filter_audio(pick_energetic_segment(decoded["sls_fire"], int(1.1 * SR), SR), 1100.0, 6200.0, SR), -2.5), len_ex)
        tex = np.arange(len_ex, dtype=np.float32)[:, None] / float(SR)
        ex_dry = (
            0.78 * ex_crack * np.exp(-tex / 0.24)
            + 0.84 * ex_boom * np.exp(-tex / 0.85)
            + 0.62 * ex_sei * np.exp(-tex / 0.72)
            + 0.42 * ex_shatter * np.clip((tex - 0.06) / 0.04, 0.0, 1.0) * np.exp(-tex / 0.52)
        )
        ex_wet = convolve_linear(normalize_peak(ex_dry.astype(np.float32), -1.0), ir_hull, wet=0.22, sr=SR)
        rendered["sfx-explosion"] = apply_fades(normalize_peak(ex_wet, -1.0), 3.0, 210.0, SR)

        # 15. sfx-ui-click: 62ms crisp SuperCam tactile relay snap
        clk = find_peak_slice(filter_audio(decoded["perseverance_laser"], 750.0, 6800.0, SR), 3.0, 62.0, SR)
        t_c = np.arange(len(clk), dtype=np.float32)[:, None] / float(SR)
        clk = apply_fades(clk * np.exp(-t_c / 0.019), 1.5, 16.0, SR)
        rendered["sfx-ui-click"] = normalize_peak(clk, -2.0)

        # 16. sfx-ui-toggle: 110ms hardware detent + clean Quindar glint
        tog_len = int(0.110 * SR)
        t_las = pad_or_trim(normalize_peak(filter_audio(find_peak_slice(decoded["perseverance_laser"], 4.0, 95.0, SR), 420.0, 5200.0, SR), -2.5), tog_len)
        t_qin = pad_or_trim(normalize_peak(rendered["sfx-quindar-in"][:int(0.055 * SR)], -2.0), tog_len)
        ttg = np.arange(tog_len, dtype=np.float32)[:, None] / float(SR)
        rendered["sfx-ui-toggle"] = apply_fades(normalize_peak(0.76 * t_las * np.exp(-ttg / 0.028) + 0.24 * t_qin * np.exp(-ttg / 0.024), -2.0), 2.0, 22.0, SR)

        # 17. sfx-ui-tab: 125ms harmonic telemetry screen-switch chime
        tab_len = int(0.125 * SR)
        tab_tone = pitch_shift_stereo(rendered["sfx-quindar-in"][:int(0.11 * SR)], -5.0, SR)
        tab_pad = pad_or_trim(normalize_peak(tab_tone, -2.5), tab_len)
        t_tab = np.arange(tab_len, dtype=np.float32)[:, None] / float(SR)
        rendered["sfx-ui-tab"] = apply_fades(
            normalize_peak(0.78 * tab_pad * np.exp(-t_tab / 0.055) + 0.26 * pad_or_trim(clk, tab_len), -2.5),
            2.5, 28.0, SR,
        )

        # 18. sfx-ui-confirm: 260ms ascending 2-note mission-commit telemetry chirp
        cnf_len = int(0.260 * SR)
        cnf_1 = pitch_shift_stereo(rendered["sfx-quindar-out"][:int(0.085 * SR)], -9.0, SR)
        cnf_2 = pitch_shift_stereo(rendered["sfx-quindar-in"][:int(0.140 * SR)], -4.0, SR)
        cnf_buf = np.zeros((cnf_len, 2), dtype=np.float32)
        c1 = apply_fades(normalize_peak(cnf_1, -2.5), 3.0, 18.0, SR)
        c2 = apply_fades(normalize_peak(cnf_2, -2.0), 3.0, 35.0, SR)
        cnf_buf[:len(c1)] += c1 * 0.85
        o2 = int(0.095 * SR)
        m2 = min(len(c2), cnf_len - o2)
        cnf_buf[o2:o2 + m2] += c2[:m2]
        cnf_buf[:min(len(clk), cnf_len)] += clk[:min(len(clk), cnf_len)] * 0.28
        rendered["sfx-ui-confirm"] = apply_fades(normalize_peak(cnf_buf, -2.0), 2.0, 30.0, SR)

        # 19. sfx-ui-deny: 220ms low two-tone fault/reject thud
        dny_len = int(0.220 * SR)
        dny_hi = apply_fades(normalize_peak(pitch_shift_stereo(rendered["sfx-quindar-out"][:int(0.090 * SR)], -23.0, SR), -2.5), 3.0, 20.0, SR)
        dny_lo = apply_fades(normalize_peak(pitch_shift_stereo(rendered["sfx-quindar-out"][:int(0.115 * SR)], -28.0, SR), -2.0), 3.0, 28.0, SR)
        dny_th = pad_or_trim(normalize_peak(filter_audio(find_peak_slice(decoded["insight_seismic"], 4.0, 120.0, SR), 45.0, 280.0, SR), -2.5), dny_len)
        dny_buf = dny_th * 0.35
        dny_buf[:len(dny_hi)] += dny_hi * 0.80
        od2 = int(0.092 * SR)
        md2 = min(len(dny_lo), dny_len - od2)
        dny_buf[od2:od2 + md2] += dny_lo[:md2]
        rendered["sfx-ui-deny"] = apply_fades(normalize_peak(dny_buf, -2.0), 2.0, 26.0, SR)

        # 20. sfx-warn-caution: 480ms amber caution dual chime (~1500 Hz)
        cau_len = int(0.480 * SR)
        cau_p = apply_fades(normalize_peak(pitch_shift_stereo(rendered["sfx-quindar-in"][:int(0.115 * SR)], -9.0, SR), -2.5), 4.0, 26.0, SR)
        cau_buf = np.zeros((cau_len, 2), dtype=np.float32)
        cau_buf[:len(cau_p)] += cau_p
        oc2 = int(0.190 * SR)
        mc2 = min(len(cau_p), cau_len - oc2)
        cau_buf[oc2:oc2 + mc2] += cau_p[:mc2] * 0.90
        rendered["sfx-warn-caution"] = normalize_peak(cau_buf, -2.5)

        # 21. sfx-alarm: 850ms unmistakable triple-pulse NASA master caution/alarm
        al_len = int(0.850 * SR)
        al_q = normalize_peak(rendered["sfx-quindar-out"][:int(0.125 * SR)], -2.0)
        al_ch = normalize_peak(filter_audio(pick_energetic_segment(decoded["earth_chorus"], len(al_q), SR), 900.0, 3400.0, SR), -6.5)
        pulse_a = apply_fades(0.82 * al_q + 0.18 * al_ch, 4.0, 28.0, SR)
        al_buf = np.zeros((al_len, 2), dtype=np.float32)
        for idx_p, off_sec in enumerate([0.0, 0.24, 0.48]):
            pos = int(round(off_sec * SR))
            w = min(len(pulse_a), al_len - pos)
            if w > 0:
                al_buf[pos:pos + w] += pulse_a[:w] * (1.0 - 0.08 * idx_p)
        rendered["sfx-alarm"] = normalize_peak(al_buf, -1.5)

        stem_entries = []
        total_bytes = 0
        for sid, kind, fname, period_sec, src_keys in specs:
            out_path = stems_dir / fname
            arr = rendered[sid]
            if fname.endswith(".wav"):
                dur_sec = encode_wav(arr, out_path, sr=IR_SR)
            else:
                br = "80k" if kind == "music" else "96k"
                dur_sec = encode_mp3(arr, out_path, decode_tmp, bitrate=br, sr=SR)
            size_bytes = out_path.stat().st_size
            total_bytes += size_bytes
            entry: dict[str, Any] = {
                "id": sid,
                "file": f"stems/{fname}",
                "kind": kind,
                "durationSec": dur_sec,
                "bytes": size_bytes,
                "sha256": sha256_file(out_path),
                "sources": [
                    {
                        "key": k,
                        "title": SOURCES[k]["title"],
                        "credit": SOURCES[k]["credit"],
                        "license": SOURCES[k]["license"],
                        "url": SOURCES[k]["commons_url"],
                    }
                    for k in src_keys
                ],
            }
            if sid == "music-orbital":
                entry["synthesis"] = "Original D Dorian 4-chord analog & Rhodes synthesis convolved with NASA ir-hull"
            elif sid == "music-interstellar":
                entry["synthesis"] = "Original A Lydian 4-chord analog & glass-swell synthesis convolved with NASA ir-hull"
            elif sid == "music-combat":
                entry["synthesis"] = "Original 120 BPM D Phrygian tactical bass/brass + NASA percussion convolved with NASA ir-hull"
            if kind in ("loop", "music") and period_sec is not None:
                entry["loopStart"] = LOOP_START_SEC
                entry["loopEnd"] = round(LOOP_START_SEC + period_sec, 4)
            stem_entries.append(entry)
            print(f"  Built {entry['file']} ({size_bytes} bytes, {dur_sec:.3f}s)")

        manifest = {
            "version": 3,
            "generatedBy": "build_stems.py",
            "totalBytes": total_bytes,
            "stemCount": len(stem_entries),
            "stems": stem_entries,
        }
        manifest_path = output_dir / "manifest.json"
        with manifest_path.open("w", encoding="ascii", newline="\n") as fh:
            json.dump(manifest, fh, indent=2, ensure_ascii=True)
            fh.write("\n")

        lines = [
            "# Lighthugger NASA Public-Domain Audio Provenance",
            "",
            "All Lighthugger audio stems and impulse responses are derived from verified",
            "Public Domain U.S. Government works (`PD-USGov-NASA`) hosted on Wikimedia Commons",
            "and transformed offline via Python 3.12 (`numpy`, `scipy`, `librosa`, `soundfile`) + FFmpeg.",
            "",
            "## Source Recordings",
            "",
            "| Key | File / Instrument | Credit | License | Commons URL |",
            "| --- | --- | --- | --- | --- |",
        ]
        for k, s in SOURCES.items():
            lines.append(f"| `{k}` | {s['title']} ({s['description']}) | {s['credit']} | {s['license']} | {s['commons_url']} |")
        lines.extend([
            "",
            "## Derived Browser Stems (`stems/`)",
            "",
            "| Stem ID | File | Kind | Size (bytes) | Source Keys |",
            "| --- | --- | --- | --- | --- |",
        ])
        for st in stem_entries:
            skeys = ", ".join(f"`{s['key']}`" for s in st["sources"])
            note = f" ({st['synthesis']})" if "synthesis" in st else ""
            lines.append(f"| `{st['id']}` | `{st['file']}` | `{st['kind']}` | {st['bytes']} | {skeys}{note} |")
        lines.extend([
            "",
            "Original space music (`music-orbital.mp3` in D Dorian, `music-interstellar.mp3` in A Lydian, and",
            "`music-combat.mp3` in 120 BPM D Phrygian) is procedurally synthesized and convolved with `ir-hull.wav`",
            "(derived from the NASA spectra listed above).",
            "",
        ])
        attr_path = output_dir / "ATTRIBUTION.md"
        with attr_path.open("w", encoding="ascii", newline="\n") as fh:
            fh.write("\n".join(lines))

        print(f"Done: {len(stem_entries)} stems, totalBytes={total_bytes} ({total_bytes / 1024.0:.1f} KiB)")
        return manifest
    finally:
        shutil.rmtree(decode_tmp, ignore_errors=True)
        if created_tmp and not keep_raw:
            shutil.rmtree(raw_dir, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Lighthugger NASA found-sound audio stems.")
    parser.add_argument("--keep-raw", action="store_true", help="Preserve temporary downloaded raw files.")
    parser.add_argument("--raw-dir", default=None, help="Optional directory to store/reuse raw downloads.")
    args = parser.parse_args()
    out_dir = Path(__file__).resolve().parent
    manifest = build_all(out_dir, keep_raw=args.keep_raw, raw_dir_arg=args.raw_dir)
    if manifest["totalBytes"] >= 2_800_000:
        print(f"WARNING: totalBytes {manifest['totalBytes']} exceeds 2.8 MB budget", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
