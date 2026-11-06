"""Export the three launch animations from the owner's EGIN Splash.mp4.

Usage: python scripts/prepare-splash.py INPUT --ffmpeg /path/to/ffmpeg
The input is a 1080x1920, 30 fps, 288-frame presentation (three 96-frame demos).
Only the animation is exported; the example dashboard is not application data.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess

SOURCE_SHA256 = "f91cccaa550580058d2a189a39606050b3c10af67396bd6b54ed61a63dfa1e54"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    digest = hashlib.sha256(args.input.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit("Unexpected source video; review the frame boundaries before exporting.")
    output = Path(__file__).resolve().parents[1] / "apps/mobile/public/splash"
    output.mkdir(parents=True, exist_ok=True)
    for name, start in [("flow", 0), ("bars", 96), ("pulse", 192)]:
        # Remove the presentation labels in the outer margin without covering
        # animation pixels. Hold the final brand frame before the real app opens.
        filters = (f"trim=start_frame={start}:end_frame={start + 60},setpts=PTS-STARTPTS,"
                   "crop=1080:1728:0:96,scale=720:1152:flags=lanczos,"
                   "tpad=stop_mode=clone:stop_duration=0.2,setsar=1")
        subprocess.run([args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                        "-i", str(args.input), "-map", "0:v:0", "-vf", filters,
                        "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                        "-pix_fmt", "yuv420p", "-profile:v", "main", "-level", "3.1",
                        "-movflags", "+faststart", "-map_metadata", "-1",
                        str(output / f"{name}-v1.mp4")], check=True)
        print(name, (output / f"{name}-v1.mp4").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
