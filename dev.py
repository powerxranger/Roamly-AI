"""
Local Development Orchestrator for Roamly AI.
Starts both the FastAPI Python backend and the React Vite frontend concurrently with a single command.
"""

import os
import subprocess
import sys
import time


def kill_process_tree(proc):
    """Cleanly terminates process and any child processes (Node / Uvicorn)."""
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            proc.terminate()
            proc.wait(timeout=2)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    client_dir = os.path.join(root_dir, "client")

    print("=" * 65)
    print("  🚀 Launching Roamly AI (Full-Stack Local Development)")
    print("=" * 65)
    print()
    print("  • Python Backend:  http://127.0.0.1:8000 (API & Agents)")
    print("  • React Frontend:  http://localhost:5173 (Vite with Hot-Reload)")
    print()
    print("  👉 Open http://localhost:5173 in your browser to use the app.")
    print("  👉 Press Ctrl + C to stop both servers simultaneously.")
    print("-" * 65)
    print()

    # Check and auto-install client dependencies if node_modules is missing
    node_modules_dir = os.path.join(client_dir, "node_modules")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    if not os.path.exists(node_modules_dir):
        print("📦 First-time setup detected: Installing frontend dependencies (npm install)...")
        print("   This only happens once.\n")
        res = subprocess.run([npm_cmd, "install"], cwd=client_dir)
        if res.returncode != 0:
            print("\n❌ Failed to run 'npm install' in client folder.")
            print("   Please make sure Node.js is installed on your computer.")
            return
        print("\n✓ Dependencies installed successfully!\n")

    # 1. Start Python backend
    backend_proc = subprocess.Popen(
        [sys.executable, "app.py"],
        cwd=root_dir,
    )

    # 2. Start Vite frontend
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=client_dir,
    )

    try:
        while True:
            time.sleep(0.5)
            if backend_proc.poll() is not None:
                print("\n[Backend process stopped]")
                break
            if frontend_proc.poll() is not None:
                print("\n[Frontend process stopped]")
                break
    except KeyboardInterrupt:
        print("\n\nStopping both servers cleanly...")
    finally:
        kill_process_tree(backend_proc)
        kill_process_tree(frontend_proc)
        print("✓ Both servers stopped. Goodbye!\n")


if __name__ == "__main__":
    main()
