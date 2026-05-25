# PID Lab

A static local web app for learning how PID control loops work.

## Live Site

Visit the app at https://teganburns.github.io/pid-lab/

The app includes:

- P, I, and D explanation cards
- A live response chart for setpoint, process variable, error, and control effort
- Presets for stable, overshoot, sluggish, and disturbance-recovery scenarios
- Sliders and numeric inputs for Kp, Ki, Kd, setpoint, disturbance, and plant damping
- Metrics for rise time, overshoot, steady-state error, and settling time

## Run Locally

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 5173
```

Then visit:

```text
http://127.0.0.1:5173/
```
