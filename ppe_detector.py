import time
import random

def detect_ppe(frame):
    """
    STUB FOR BACKEND AI TEAM.
    Simulates detection of safety violations (missing hardhat/vest) 
    until the trained backend model is delivered.
    """
    # Artificial small delay to simulate model inference
    time.sleep(0.01)
    
    # Simulate a violation trigger periodically for testing UI
    current_sec = int(time.time())
    is_violation = (current_sec % 7 == 0) # Triggers every 7 seconds for test UI
    
    return {
        "violation_detected": is_violation,
        "no_hat": is_violation and random.choice([True, False]),
        "no_vest": is_violation and random.choice([True, False])
    }