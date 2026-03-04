# Week 09 Quiz: Interaction and Virtual Environments (14 Questions)

---

## VE Foundations: Model-Based vs Image-Based

You are building a virtual tour of a real heritage building for a museum. Visitors should be able to walk freely around the space and inspect architectural details from any angle. Which approach is most appropriate?

A. Model-based
B. Image-based
C. Either approach works equally well for this use case
D. Neither approach can support free exploration of a real building

> Correct Answer: A. Model-based

---

## VE Foundations: Image-Based Trade-Off

A startup wants to quickly prototype a VR relaxation app featuring real-world nature scenes. They have limited 3D modelling expertise but access to a 360-degree camera. What is the main trade-off of choosing an image-based approach?

A. Faster to produce, but users are limited to fixed viewpoints
B. Slower to produce, but users get full 6-DOF movement
C. The images will not work inside an HMD
D. Image-based scenes cannot include any audio

> Correct Answer: A. Faster to produce, but users are limited to fixed viewpoints

---

## Interaction Concepts: Natural vs Artificial

Consider these two VR locomotion methods: (A) the user physically walks in a tracked space to move, and (B) the user pushes a thumbstick on a controller to glide forward. How would you classify them on the natural-to-artificial spectrum?

A. A is natural, B is artificial
B. A is artificial, B is natural
C. Both are natural since they both move the user
D. Both are artificial since neither is "real" movement

> Correct Answer: A. A is natural, B is artificial

---

## Hardware and Interaction: Bare-Hand Manipulation

A design team wants users to pick up and inspect virtual pottery using their bare hands in VR. Which hardware capability is most essential to enable this interaction?

A. High-resolution display panels
B. Hand tracking with finger-level skeletal data
C. Eye tracking for foveated rendering
D. Spatial audio with head-related transfer functions

> Correct Answer: B. Hand tracking with finger-level skeletal data

---

## Presence: Plausibility Illusion

In the game SUPERHOT VR, time only moves when the player physically moves. This mechanic is entirely unrealistic, yet players report high immersion. Which concept best explains why an artificial interaction can still feel immersive?

A. Place illusion: the virtual space feels like a real location
B. Plausibility illusion: the scenario responds consistently to the player, like these events are really happening
C. Cybersickness: unrealistic motion always reduces immersion
D. Fidelity: higher polygon counts increase presence

> Correct Answer: B. Plausibility illusion: the scenario responds consistently to the player, like these events are really happening

---

## Interaction Design: Fire-Safety Training

You are designing a VR fire-safety training simulation. Trainees should learn to use a fire extinguisher to translate that skill to real-life. Which interaction approach provides the right level of authenticity?

A. Trainee grab a virtual extinguisher that can be aimed and triggered to spray infinite virtual foam
B. Trainee grab a virtual extinguisher that can be aimed and triggered, with virtual foam that depletes over time
C. Trainee does a spell-casting gesture to conjure virtual foam

> Correct Answer: B. Trainee grab a virtual extinguisher that can be aimed and triggered, with virtual foam that depletes over time

---

## Embodiment: Virtual Threat Avoidance

In a VR experiment, many users tend to route their hands around the virtual saw blade (avoiding passing through it) when asked to place their hands in a target position. What is the primary reason for this behaviour?

A. Limited field of view in the VR HMD affecting depth perception
B. Hyper-realistic appearance of the virtual saw blade
C. Difficulty in accurately perceiving the virtual saw blade's position
D. High degree of embodiment via realistic hand representation and precise hand tracking

> Correct Answer: D. High degree of embodiment via realistic hand representation and precise hand tracking

---

## Locomotion Selection: Action-Adventure Context

As lead developer for a VR action-adventure game, players will engage in quests across varying terrain (dense forests, steep mountains). Movement needs to be intuitive, near-realistic, and encourage sustained play without disorientation. What locomotion technique should you integrate?

A. Teleportation
B. Joystick-based continuous locomotion
C. Walking-in-place (WIP) with HTC Vive HMD and trackers
D. Tracking real movement in physical space

> Correct Answer: C. Walking-in-place (WIP) with HTC Vive HMD and trackers

---

## Locomotion Comfort: Long-Distance Traversal

You are tasked to build a VR game where users roam freely in a vast open world. Distances between points of interest are 10-20 kilometres. Cybersickness is the most important concern and augmentation of movement speeds is known to induce more symptoms. What locomotion technique is best suited?

A. Teleportation
B. Joystick-based continuous locomotion
C. Walking-in-place (WIP) with KatVR 360 slidemill
D. Walking-in-place (WIP) with HTC Vive HMD and trackers
E. Tracking real movement in physical space

> Correct Answer: A. Teleportation

---

## Babylon.js Pattern: Actions

You want to create a button in your Babylon.js scene that, when touched, makes a door open with a creaking sound. Which implementation pattern is the most straightforward?

A. Behaviours: attach a built-in drag or follow behaviour to the door
B. Actions: register an OnPickTrigger on the button with an ExecuteCodeAction
C. Observables: create a custom Observable and notify observers when the button is pressed

> Correct Answer: B. Actions: register an OnPickTrigger on the button with an ExecuteCodeAction

---

## Babylon.js Pattern: Behaviours

In your VR lab simulation, users need to pick up beakers and drag them across a table surface. Which Babylon.js interaction pattern is the most straightforward for this?

A. Behaviours: attach a SixDofDragBehavior to the beaker mesh
B. Actions: register an OnPickTrigger with an ExecuteCodeAction that moves the beaker
C. Observables: add an observer to onBeforeRenderObservable that tracks pointer position and repositions the beaker each frame

> Correct Answer: A. Behaviours: attach a SixDofDragBehavior to the beaker mesh

---

## Babylon.js Pattern: Observables

You are building a VR physics playground. Whenever a ball's distance from the origin changes, a HUD display should update to show the current distance. The distance check must run every frame. Which pattern is most appropriate?

A. Behaviours: attach a built-in behaviour to the ball that tracks distance
B. Actions: register an OnIntersectionEnterTrigger on invisible spheres at fixed distances
C. Observables: add an observer to scene.onBeforeRenderObservable that computes distance each frame and notifies a custom Observable

> Correct Answer: C. Observables: add an observer to scene.onBeforeRenderObservable that computes distance each frame and notifies a custom Observable

---

## Babylon.js Teleportation: timeToTeleport

What does `timeToTeleport` do in the following Babylon.js code?

```javascript
const teleportation = featureManager.enableFeature(
  WebXRFeatureName.TELEPORTATION, "stable", {
    xrInput: xr.input,
    floorMeshes: [ground],
    timeToTeleport: 2000,
    useMainComponentOnly: true,
  }, true, true
);
teleportation.parabolicRayEnabled = true;
```

A. Sets the duration of the teleportation animation
B. Sets the maximum time to complete the teleportation
C. Sets the minimum delay between each teleportation trigger
D. Sets the time to hold the button before teleportation triggers

> Correct Answer: D. Sets the time to hold the button before teleportation triggers

---

## GUI in VR: Maintenance Training Scenario

You are building a VR training simulation for aircraft maintenance engineers with a quizzing system to evaluate their performance. The immersion goal is realistic training. What form of GUI implementation is best suited?

A. Diegetic GUI on a virtual clipboard and pen, mirroring real maintenance checklists
B. GUI on a floating holographic panel anchored in the virtual workspace
C. Real-world quiz on real paper (take off the HMD when interacting)

> Correct Answer: A. Diegetic GUI on a virtual clipboard and pen, mirroring real maintenance checklists

---
