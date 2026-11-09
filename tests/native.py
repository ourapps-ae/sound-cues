"""Compile and run the Swift checks (macOS) and type-check the Swift sources for iOS; compile the Kotlin checks.

Usage: python3 tests/native.py apple|android
"""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]


def ios_flags():
    sdk = subprocess.run(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"], capture_output=True, text=True, check=True).stdout.strip()
    return ["-sdk", sdk, "-target", "arm64-apple-ios17.0-simulator"]


def apple():
    sources = sorted(str(p) for p in (root / "implementation/apple/Sources").glob("*.swift"))
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "check"
        subprocess.run(["swiftc", *sources, str(root / "tests/apple/main.swift"), "-o", str(output)], check=True)
        subprocess.run([str(output)], cwd=root, check=True)
    subprocess.run(["swiftc", "-typecheck", *ios_flags(), *sources], check=True)
    print("ios type-check passed")


def android():
    sources = sorted((root / "implementation/android/src/main/java").rglob("*.kt"))
    pure = [str(p) for p in sources if p.name == "CueModel.kt"]
    tests = sorted(str(p) for p in (root / "tests/android").glob("*.kt"))
    with tempfile.TemporaryDirectory() as directory:
        jar = str(Path(directory) / "check.jar")
        subprocess.run(["kotlinc", *pure, *tests, "-include-runtime", "-d", jar], check=True)
        subprocess.run(["java", "-jar", jar], cwd=root, check=True)
    # The Android player needs the Android SDK: compiled in the application's Gradle build.


{"apple": apple, "android": android}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit("expected apple or android"))()
