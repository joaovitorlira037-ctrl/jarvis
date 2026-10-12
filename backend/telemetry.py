import platform
import time

import psutil


def snapshot():
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    network = psutil.net_io_counters()
    try:
        battery = psutil.sensors_battery()
    except (OSError, NotImplementedError):
        battery = None
    try:
        temperatures = psutil.sensors_temperatures() if hasattr(psutil, "sensors_temperatures") else {}
    except (OSError, NotImplementedError):
        temperatures = {}
    readings = [v.current for values in temperatures.values() for v in values if v.current > 0]
    return {
        "source": "backend_host",
        "cpu_percent": psutil.cpu_percent(),
        "cpu_count": psutil.cpu_count(),
        "memory_percent": memory.percent,
        "memory_used": memory.used,
        "memory_total": memory.total,
        "disk_percent": disk.percent,
        "disk_free": disk.free,
        "disk_total": disk.total,
        "network_sent": network.bytes_sent,
        "network_received": network.bytes_recv,
        "battery_percent": battery.percent if battery else None,
        "temperature_c": round(max(readings), 1) if readings else None,
        "gpu_percent": None,
        "uptime_seconds": int(time.time() - psutil.boot_time()),
        "platform": platform.system(),
        "timestamp": time.time(),
    }
