import http.server
import socketserver
import webbrowser
import threading
import os
import sys
import time

PORT = 8000

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and disable caching to ensure smooth development/reloads
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def start_server():
    # Ensure current working directory is the folder of this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Use ThreadingTCPServer to avoid blocking when downloading large CSV chunks and fetching assets
    class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True

    handler = CustomHTTPRequestHandler
    
    try:
        with ThreadingHTTPServer(("", PORT), handler) as httpd:
            print(f"\n========================================================")
            print(f"      ANTIGRAVITY STAY HOTEL BOOKING ANALYTICS")
            print(f"========================================================")
            print(f"[*] Local Server started on http://localhost:{PORT}")
            print(f"[*] Reading directory: {script_dir}")
            print(f"[*] Press Ctrl+C in this console to terminate the server.")
            print(f"========================================================")
            
            # Start a thread to open the browser automatically
            threading.Thread(target=open_browser, daemon=True).start()
            
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 98 or e.errno == 10048:
            print(f"[!] Error: Port {PORT} is already in use.")
            print(f"[!] Please close any running servers on port {PORT} and try again.")
        else:
            print(f"[!] System Error: {e}")
    except Exception as e:
        print(f"[!] Server terminated: {e}")

def open_browser():
    time.sleep(0.5) # small delay to let server bind
    url = f"http://localhost:{PORT}/index.html"
    print(f"[*] Opening browser to {url}...")
    webbrowser.open(url)

if __name__ == '__main__':
    try:
        start_server()
    except KeyboardInterrupt:
        print("\n[*] Server shutdown signal received. Stopping local server...")
        sys.exit(0)
