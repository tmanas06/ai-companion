#!/usr/bin/env python3
"""
Aria Photorealistic Video Asset Generator (High Performance Streaming Pipeline)
==============================================================================
Generates the complete set of seamless, photorealistic video clips for the
AI Companion (Aria) using her canonical master portrait (aria-portrait.webp)
and calibrated facial expression masks (aria-blink.webp, aria-speak.webp).

Streaming Architecture:
- Direct rawvideo stdin pipe into ffmpeg (zero intermediate disk PNG I/O)
- 720x720 @ 30 FPS
- H.264 MP4 (faststart, yuv420p, crf 20, veryfast)
- WebM VP9 (realtime deadline, cpu-used 6, speed ~6x realtime)
"""

import os
import math
import subprocess
import numpy as np
from PIL import Image, ImageFilter

PORTRAIT_PATH = "apps/web/public/avatars/aria-portrait.webp"
BLINK_PATH = "apps/web/public/avatars/aria-blink.webp"
SPEAK_PATH = "apps/web/public/avatars/aria-speak.webp"
OUTPUT_DIR = "apps/web/public/avatars/aria"

TARGET_RES = 720
FPS = 30


def create_smooth_mask(center_x, center_y, radius_x, radius_y, size=(720, 720), blur_radius=15):
    """Generate a feathered elliptical alpha mask for seamless facial feature blending."""
    arr = np.zeros((size[1], size[0]), dtype=np.float32)
    y_idx, x_idx = np.ogrid[:size[1], :size[0]]
    dist_sq = ((x_idx - center_x) / radius_x) ** 2 + ((y_idx - center_y) / radius_y) ** 2
    inside = dist_sq <= 1.0
    falloff = (dist_sq > 1.0) & (dist_sq <= 1.5)
    arr[inside] = 1.0
    arr[falloff] = 0.5 * (1.0 + np.cos(np.pi * (np.sqrt(dist_sq[falloff]) - 1.0) / 0.5))
    mask = Image.fromarray((arr * 255).astype(np.uint8), mode="L")
    return mask.filter(ImageFilter.GaussianBlur(blur_radius))


class AriaVideoSynthesizer:
    def __init__(self):
        print(f"[AriaVideo] Initializing canonical assets from {PORTRAIT_PATH} at {TARGET_RES}x{TARGET_RES}...")
        orig_p = Image.open(PORTRAIT_PATH).convert("RGB")
        orig_b = Image.open(BLINK_PATH).convert("RGB")
        orig_s = Image.open(SPEAK_PATH).convert("RGB")

        self.portrait = orig_p.resize((TARGET_RES, TARGET_RES), Image.Resampling.LANCZOS)
        self.blink = orig_b.resize((TARGET_RES, TARGET_RES), Image.Resampling.LANCZOS)
        self.speak = orig_s.resize((TARGET_RES, TARGET_RES), Image.Resampling.LANCZOS)

        scale_factor = TARGET_RES / 1024.0
        cx_eye = int(508 * scale_factor)
        cy_eye = int(368 * scale_factor)
        rx_eye = int(185 * scale_factor)
        ry_eye = int(85 * scale_factor)
        self.eye_mask = create_smooth_mask(cx_eye, cy_eye, rx_eye, ry_eye, size=(TARGET_RES, TARGET_RES))

        cx_mouth = int(513 * scale_factor)
        cy_mouth = int(599 * scale_factor)
        rx_mouth = int(155 * scale_factor)
        ry_mouth = int(95 * scale_factor)
        self.mouth_mask = create_smooth_mask(cx_mouth, cy_mouth, rx_mouth, ry_mouth, size=(TARGET_RES, TARGET_RES))

        self.pivot = (int(512 * scale_factor), int(860 * scale_factor))

    def composite_frame(self, blink_factor=0.0, speak_factor=0.0, tilt_angle=0.0, y_offset=0.0, x_offset=0.0, scale=1.0):
        """Synthesizes a single high-fidelity frame."""
        frame = self.portrait.copy()

        if blink_factor > 0.001:
            blink_blend = Image.blend(self.portrait, self.blink, min(1.0, blink_factor))
            frame.paste(blink_blend, (0, 0), self.eye_mask)

        if speak_factor > 0.001:
            speak_blend = Image.blend(self.portrait, self.speak, min(1.0, speak_factor))
            frame.paste(speak_blend, (0, 0), self.mouth_mask)

        if abs(tilt_angle) > 0.01 or abs(y_offset) > 0.1 or abs(x_offset) > 0.1 or abs(scale - 1.0) > 0.001:
            w, h = frame.size
            if abs(scale - 1.0) > 0.001:
                nw, nh = int(w * scale), int(h * scale)
                rescaled = frame.resize((nw, nh), Image.Resampling.BILINEAR)
                crop_x = (nw - w) // 2
                crop_y = (nh - h) // 2
                frame = rescaled.crop((crop_x, crop_y, crop_x + w, crop_y + h))

            if abs(tilt_angle) > 0.01:
                frame = frame.rotate(tilt_angle, resample=Image.Resampling.BILINEAR, center=self.pivot)

            if abs(x_offset) > 0.1 or abs(y_offset) > 0.1:
                frame = frame.transform(
                    frame.size,
                    Image.Transform.AFFINE,
                    (1, 0, -x_offset, 0, 1, -y_offset),
                    resample=Image.Resampling.BILINEAR
                )

        return frame

    def render_clip(self, frame_generator, duration_sec, out_path_base):
        """Renders frames directly into ffmpeg stdin pipe and produces MP4 + WebM."""
        num_frames = int(duration_sec * FPS)
        os.makedirs(os.path.dirname(out_path_base), exist_ok=True)
        mp4_path = f"{out_path_base}.mp4"
        webm_path = f"{out_path_base}.webm"

        # 1. Direct rawvideo stream to H.264 MP4
        mp4_cmd = [
            "ffmpeg", "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{TARGET_RES}x{TARGET_RES}",
            "-pix_fmt", "rgb24",
            "-r", str(FPS),
            "-i", "-",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            mp4_path
        ]
        proc = subprocess.Popen(mp4_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for i in range(num_frames):
            t = i / FPS
            progress = i / (num_frames - 1) if num_frames > 1 else 0.0
            frame = frame_generator(t, progress, num_frames)
            proc.stdin.write(frame.tobytes())
        proc.stdin.close()
        proc.wait()

        # 2. Fast WebM transcode directly from the MP4 (5x realtime)
        webm_cmd = [
            "ffmpeg", "-y",
            "-i", mp4_path,
            "-c:v", "libvpx-vp9",
            "-deadline", "realtime",
            "-cpu-used", "6",
            "-b:v", "0",
            "-crf", "32",
            "-pix_fmt", "yuv420p",
            webm_path
        ]
        subprocess.run(webm_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        mp4_kb = os.path.getsize(mp4_path) / 1024
        webm_kb = os.path.getsize(webm_path) / 1024
        print(f"  ✓ Rendered {os.path.basename(mp4_path)} ({duration_sec}s, MP4: {mp4_kb:.1f} KB, WebM: {webm_kb:.1f} KB)")


def blink_curve(t, blink_time, blink_duration=0.22):
    """Realistic eyelid blink profile."""
    dt = t - blink_time
    if 0 <= dt <= blink_duration:
        u = dt / blink_duration
        if u < 0.4:
            return math.sin(u / 0.4 * (math.pi / 2))
        elif u < 0.5:
            return 1.0
        else:
            return math.cos((u - 0.5) / 0.5 * (math.pi / 2))
    return 0.0


def generate_all_aria_videos():
    synthesizer = AriaVideoSynthesizer()

    # 1. IDLE
    print("\n--- Generating Idle Clips ---")
    def idle_01_frames(t, progress, total_frames):
        breath_phase = 2.0 * math.pi * (t / 4.0)
        y_off = 1.4 * math.sin(breath_phase)
        scale = 1.0 + 0.0025 * math.sin(breath_phase)
        tilt = 0.3 * math.sin(breath_phase)
        blink = blink_curve(t, 2.0, 0.20)
        return synthesizer.composite_frame(blink_factor=blink, y_offset=y_off, scale=scale, tilt_angle=tilt)

    synthesizer.render_clip(idle_01_frames, 4.0, os.path.join(OUTPUT_DIR, "idle", "idle_01"))

    def idle_02_frames(t, progress, total_frames):
        breath_phase = 2.0 * math.pi * (t / 5.0)
        y_off = 1.6 * math.sin(breath_phase)
        scale = 1.0 + 0.003 * math.sin(breath_phase)
        tilt = -0.35 * math.cos(breath_phase)
        blink = max(blink_curve(t, 1.8, 0.20), blink_curve(t, 3.8, 0.22))
        return synthesizer.composite_frame(blink_factor=blink, y_offset=y_off, scale=scale, tilt_angle=tilt)

    synthesizer.render_clip(idle_02_frames, 5.0, os.path.join(OUTPUT_DIR, "idle", "idle_02"))

    # 2. LISTENING
    print("\n--- Generating Listening Clips ---")
    def listening_01_frames(t, progress, total_frames):
        phase = 2.0 * math.pi * (t / 3.5)
        nod_phase = (t - 1.4) / 0.7
        nod = 0.0
        if 0 <= nod_phase <= 1.0:
            nod = 2.8 * math.sin(nod_phase * math.pi)
        y_off = 1.0 * math.sin(phase) + nod
        tilt = 0.25 * math.cos(phase) + 0.25
        blink = blink_curve(t, 2.6, 0.18)
        return synthesizer.composite_frame(blink_factor=blink, y_offset=y_off, tilt_angle=tilt, scale=1.003)

    synthesizer.render_clip(listening_01_frames, 3.5, os.path.join(OUTPUT_DIR, "listening", "listening_01"))

    def listening_02_frames(t, progress, total_frames):
        phase = 2.0 * math.pi * (t / 4.0)
        y_off = 0.9 * math.sin(phase)
        tilt = -0.6 * math.sin(phase) - 0.35
        blink = blink_curve(t, 1.9, 0.20)
        return synthesizer.composite_frame(blink_factor=blink, y_offset=y_off, tilt_angle=tilt, scale=1.002)

    synthesizer.render_clip(listening_02_frames, 4.0, os.path.join(OUTPUT_DIR, "listening", "listening_02"))

    # 3. THINKING
    print("\n--- Generating Thinking Clips ---")
    def thinking_01_frames(t, progress, total_frames):
        phase = 2.0 * math.pi * (t / 3.0)
        y_off = 1.3 * math.sin(phase)
        tilt = -0.8 * math.sin(phase)
        blink = blink_curve(t, 1.5, 0.22)
        return synthesizer.composite_frame(blink_factor=blink, y_offset=y_off, tilt_angle=tilt, x_offset=-0.9 * math.sin(phase))

    synthesizer.render_clip(thinking_01_frames, 3.0, os.path.join(OUTPUT_DIR, "thinking", "thinking_01"))

    # 4. SPEAKING
    print("\n--- Generating Speaking Clips ---")
    def speaking_01_frames(t, progress, total_frames):
        syllable1 = math.sin(2.0 * math.pi * 3.8 * t)
        syllable2 = math.sin(2.0 * math.pi * 1.9 * t)
        speech_val = max(0.0, 0.65 * syllable1 + 0.35 * syllable2)
        window = math.sin(math.pi * progress)
        speak_f = speech_val * (0.3 + 0.7 * window)
        head_nod = 1.8 * speak_f
        tilt = 0.45 * math.sin(2.0 * math.pi * 1.2 * t)
        blink = blink_curve(t, 2.2, 0.18)
        return synthesizer.composite_frame(speak_factor=speak_f, blink_factor=blink, y_offset=head_nod, tilt_angle=tilt)

    synthesizer.render_clip(speaking_01_frames, 3.5, os.path.join(OUTPUT_DIR, "speaking", "speaking_01"))

    def speaking_02_frames(t, progress, total_frames):
        s1 = math.sin(2.0 * math.pi * 4.2 * t)
        s2 = math.cos(2.0 * math.pi * 2.1 * t)
        speech_val = max(0.0, 0.55 * s1 + 0.45 * s2)
        window = math.sin(math.pi * progress)
        speak_f = speech_val * (0.35 + 0.65 * window)
        head_nod = 2.0 * speak_f
        tilt = -0.55 * math.sin(2.0 * math.pi * 0.9 * t)
        blink = blink_curve(t, 2.8, 0.20)
        return synthesizer.composite_frame(speak_factor=speak_f, blink_factor=blink, y_offset=head_nod, tilt_angle=tilt)

    synthesizer.render_clip(speaking_02_frames, 4.0, os.path.join(OUTPUT_DIR, "speaking", "speaking_02"))

    # 5. EMOTIONAL REACTIONS
    print("\n--- Generating Emotional Reaction Clips ---")
    def happy_01_frames(t, progress, total_frames):
        env = math.sin(math.pi * progress)
        nod = 3.5 * math.sin(2.0 * math.pi * progress) * env
        tilt = 1.0 * math.sin(math.pi * progress)
        speak_f = 0.22 * math.sin(math.pi * progress)
        blink = blink_curve(t, 1.2, 0.20)
        return synthesizer.composite_frame(speak_factor=speak_f, blink_factor=blink, y_offset=nod, tilt_angle=tilt, scale=1.0 + 0.004 * env)

    synthesizer.render_clip(happy_01_frames, 2.5, os.path.join(OUTPUT_DIR, "happy", "happy_01"))

    def empathetic_01_frames(t, progress, total_frames):
        env = math.sin(math.pi * progress)
        tilt = -1.4 * math.sin(math.pi * progress)
        nod = 2.2 * math.sin(math.pi * progress)
        blink = blink_curve(t, 1.4, 0.22)
        return synthesizer.composite_frame(blink_factor=blink, y_offset=nod, tilt_angle=tilt)

    synthesizer.render_clip(empathetic_01_frames, 3.0, os.path.join(OUTPUT_DIR, "empathetic", "empathetic_01"))

    def sad_01_frames(t, progress, total_frames):
        env = math.sin(math.pi * progress)
        y_off = 3.0 * env
        tilt = 0.7 * env
        blink = blink_curve(t, 1.2, 0.25)
        return synthesizer.composite_frame(blink_factor=blink, y_offset=y_off, tilt_angle=tilt)

    synthesizer.render_clip(sad_01_frames, 2.5, os.path.join(OUTPUT_DIR, "sad", "sad_01"))

    def surprised_01_frames(t, progress, total_frames):
        env = math.sin(math.pi * progress)
        y_off = -3.0 * math.sin(math.pi * progress)
        speak_f = 0.20 * math.sin(math.pi * progress)
        return synthesizer.composite_frame(speak_factor=speak_f, y_offset=y_off, scale=1.0 + 0.0035 * env)

    synthesizer.render_clip(surprised_01_frames, 2.0, os.path.join(OUTPUT_DIR, "surprised", "surprised_01"))

    def confused_01_frames(t, progress, total_frames):
        env = math.sin(math.pi * progress)
        tilt = 2.0 * math.sin(math.pi * progress)
        x_off = 1.3 * math.sin(math.pi * progress)
        blink = blink_curve(t, 1.3, 0.20)
        return synthesizer.composite_frame(blink_factor=blink, tilt_angle=tilt, x_offset=x_off)

    synthesizer.render_clip(confused_01_frames, 2.5, os.path.join(OUTPUT_DIR, "confused", "confused_01"))

    def laughing_01_frames(t, progress, total_frames):
        env = math.sin(math.pi * progress)
        chuckle = 2.4 * math.sin(2.0 * math.pi * 5.5 * t) * env
        speak_f = (0.24 + 0.12 * math.sin(2.0 * math.pi * 5.5 * t)) * env
        tilt = 0.7 * math.sin(math.pi * progress)
        blink = blink_curve(t, 1.0, 0.20)
        return synthesizer.composite_frame(speak_factor=speak_f, blink_factor=blink, y_offset=chuckle, tilt_angle=tilt)

    synthesizer.render_clip(laughing_01_frames, 2.5, os.path.join(OUTPUT_DIR, "laughing", "laughing_01"))

    def greeting_01_frames(t, progress, total_frames):
        env = math.sin(math.pi * progress)
        lift = -2.2 * math.sin(math.pi * progress)
        nod = 2.8 * math.sin(2.0 * math.pi * progress) * env
        speak_f = 0.18 * math.sin(math.pi * progress)
        blink = blink_curve(t, 1.2, 0.20)
        return synthesizer.composite_frame(speak_factor=speak_f, blink_factor=blink, y_offset=lift + nod, tilt_angle=0.4 * env)

    synthesizer.render_clip(greeting_01_frames, 2.5, os.path.join(OUTPUT_DIR, "greeting", "greeting_01"))

    def goodbye_01_frames(t, progress, total_frames):
        env = math.sin(math.pi * progress)
        nod = 2.6 * math.sin(math.pi * progress)
        tilt = -0.9 * math.sin(math.pi * progress)
        blink = blink_curve(t, 1.5, 0.22)
        return synthesizer.composite_frame(blink_factor=blink, y_offset=nod, tilt_angle=tilt)

    synthesizer.render_clip(goodbye_01_frames, 2.5, os.path.join(OUTPUT_DIR, "goodbye", "goodbye_01"))

    print("\n✅ All Aria video assets generated successfully!")


if __name__ == "__main__":
    generate_all_aria_videos()
