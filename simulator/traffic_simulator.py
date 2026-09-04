import time
import random

def simulate_traffic():
    print("Starting traffic simulator...")
    # In a full deployment, this would push updates to DB or WebSockets
    while True:
        time.sleep(10)
        # print("Traffic densities updated...")

if __name__ == "__main__":
    simulate_traffic()
