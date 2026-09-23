import subprocess
for port in ("8000", "8001", "8101", "5433"):
    out = subprocess.run(["/usr/sbin/lsof", "-iTCP:"+port, "-sTCP:LISTEN", "-P", "-n"],
                         capture_output=True, text=True).stdout
    print(f"--- {port} ---")
    print(out.strip() if out.strip() else "    (none listening)")
