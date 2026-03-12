# Week 10 MDQ: Industry Practices & Research Case Studies (13 Questions)

---

## Sean's Session: Role of a Solutions Architect

multi_select: true

Sean Chen is a Solutions Architect at Meta. What does a Solutions Architect do? Select all that apply.

A. Trusted technical advisor to both working and C-level enterprise executives
B. Help unblock technical challenges between both external and internal stakeholders
C. Acts as the Product evangelist building awareness and community

> Correct Answers: A, B, C
> Overall Feedback: All three are core responsibilities of a Solutions Architect. The role bridges business and technology by advising executives on immersive technology adoption, unblocking technical challenges across stakeholders, and evangelising the product to build awareness and community. It is a cross-functional role critical to enterprise immersive technology adoption.

---

## Stakeholder Analysis: Starting Point

Before any implementation decisions, the case studies in this week's lectorial emphasise a common first step. What is it?

A. Choose the VR hardware platform that maximises immersion
B. Identify all stakeholders and their needs related to immersion
C. Select a locomotion technique that minimises cybersickness
D. Decide between model-based and image-based rendering for visual fidelity

> Correct Answer: B. Identify all stakeholders and their needs related to immersion
> Overall Feedback: Both the research case studies (VR Commuting Simulator, Experience Dementia) and the enterprise case studies (TTSH) begin by identifying stakeholders and understanding their immersion-related needs, such as presence, comfort, or training effectiveness. Specific implementation choices like hardware, locomotion, and rendering come after these experiential goals are established.

---

## Experience Dementia: Balancing Reach and Immersion

Dementia Singapore wanted the experience to reach as many users as possible. How did the team balance accessibility with immersion goals?

A. Built exclusively for high-end VR headsets to maximise immersion
B. Designed both VR and Desktop versions, preserving immersion design intent across both
C. Made a mobile phone app, sacrificing immersion for convenience
D. Distributed a pre-recorded 360-degree video with no interactive immersion

> Correct Answer: B. Designed both VR and Desktop versions, preserving immersion design intent across both
> Overall Feedback: The team built both VR and Desktop versions while preserving the same design intent for immersion. This allowed them to maximise reach while also evaluating whether VR's higher immersion adds unique value for the empathy goal compared to the more accessible Desktop version.

---

## Experience Dementia: Cybersickness and Immersion Trade-off

The Experience Dementia application prioritised keeping users comfortable to maintain immersion in the empathy narrative. What approach was taken?

A. Static peripheral blur during movement
B. Narrative framing to reduce discomfort
C. Minimal locomotion through a point-and-click experience with stable viewpoint changes
D. Limiting session duration to three minutes

> Correct Answer: C. Minimal locomotion through a point-and-click experience with stable viewpoint changes
> Overall Feedback: Because the immersion goal was empathy rather than locomotion realism, the team used point-and-click with stable viewpoint changes to minimise visual-vestibular conflict. This kept users immersed in the dementia scenarios by removing discomfort that would break their engagement with the narrative.

---

## Enterprise Training: Immersive Learning Outcomes (Pfizer)

Pfizer deployed VR training for new operators learning a COVID-19 vaccine manufacturing process. How did the immersive approach compare to non-VR training?

A. 10-15% time savings and $5K savings per trainee
B. 40-60% time savings on behavioural aseptic training and up to $23K savings per trainee/trainer pair
C. No measurable difference but higher trainee satisfaction with the immersive experience
D. Faster training but lower knowledge retention due to reduced immersion in real equipment

> Correct Answer: B. 40-60% time savings on behavioural aseptic training and up to $23K savings per trainee/trainer pair
> Overall Feedback: Pfizer created immersive "Virtual Twins" of production lines and leveraged Quest haptic and hand tracking for behavioural training. The immersive approach achieved significant time and cost savings because trainees could practise repeatedly in a safe, high-fidelity virtual environment rather than waiting for access to real production lines.

---

## Enterprise Training: Immersion and Social Dynamics (Inspired Education)

Inspired Education Group deployed over 2,000 Meta Quest devices across 120 schools in 83 countries. Which finding highlights how immersion can change social dynamics in learning?

A. 94% of students learned better in VR
B. Students who were shy during regular lessons became more engaged and participative when immersed behind a headset
C. 15% improvement on multiple choice questions
D. 3% improvement in written answers

> Correct Answer: B. Students who were shy during regular lessons became more engaged and participative when immersed behind a headset
> Overall Feedback: While quantitative gains are notable, the qualitative finding about shy students is striking. The immersive environment changed how students interacted socially, suggesting that presence and embodiment in VR can lower social anxiety barriers that exist in physical classrooms.

---

## TTSH Blood Taking: Immersion Through Flow

In the TTSH blood-taking VR training, the design goal was to create an immersive practice environment for clinical staff. Which implementation decision specifically supports Flow as a dimension of immersion?

A. Replicating an actual clinical setting
B. Using controllers for higher accuracy during the procedure
C. Stable frame rate with simple textures
D. Multiplayer collaboration between trainees

> Correct Answer: B. Using controllers for higher accuracy during the procedure
> Overall Feedback: Flow requires clear goals and fluent performance, which is essential for maintaining immersion during a procedural task. Controllers provide the accuracy needed for trainees to feel in control and perform fluidly, supporting the immersive state. Replicating the clinical setting supports Presence, and stable frame rate addresses Cybersickness.

---

## TTSH Emergency Rescue: Multiplayer and Social Presence

The TTSH Emergency Rescue training uses full VR with multiplayer collaboration. Which concept of presence does multiplayer most directly support?

A. Place Illusion (PI), because the virtual environment looks realistic
B. Social presence, because interacting with real colleagues in the virtual space creates a sense of being together
C. Plausibility Illusion (PSI), because the physics engine responds realistically
D. Cybersickness reduction, because multiplayer reduces visual-vestibular conflict

> Correct Answer: B. Social presence, because interacting with real colleagues in the virtual space creates a sense of being together
> Overall Feedback: Multiplayer collaboration most directly supports social presence (also called co-presence), which is the feeling of being with other real people in a shared virtual space. This is distinct from Slater's Place Illusion (feeling of being in the place) and Plausibility Illusion (feeling that events are really happening). In the TTSH emergency rescue scenario, training alongside real colleagues strengthens the sense of togetherness and shared responsibility, which is critical for realistic team-based emergency response training.

---

## TTSH CPR Training: Cybersickness Mitigation

The TTSH CPR/BLS training uses "Dynamic Rest Frame Vignetting" to address cybersickness. Why is this technique particularly important for CPR training in VR?

A. CPR requires high visual fidelity to be effective, and vignetting improves rendering quality
B. Frequent head movement during CPR creates visual-vestibular conflict causing cybersickness, which vignetting reduces by narrowing the peripheral field of view
C. Vignetting improves hand tracking accuracy during chest compressions by reducing visual noise
D. CPR training sessions are long, and vignetting reduces eye strain from extended HMD use

> Correct Answer: B. Frequent head movement during CPR creates visual-vestibular conflict causing cybersickness, which vignetting reduces by narrowing the peripheral field of view
> Overall Feedback: CPR training involves frequent head movement between the victim and the virtual surroundings, which creates the kind of visual-vestibular mismatch that triggers cybersickness. Dynamic rest frame vignetting mitigates this by narrowing the peripheral visual field during head movement, reducing the sensory conflict. Without this technique, cybersickness symptoms like nausea and dizziness could force trainees to stop the session prematurely.

---

## TTSH CPR Training: Multi-Sensory Presence

The TTSH CPR/BLS training combines "X-Ray" internal anatomy visualisation with a haptic manikin. Both support which dimension of immersion?

A. Flow
B. Cybersickness mitigation
C. Presence
D. Effectiveness

> Correct Answer: C. Presence
> Overall Feedback: Both features strengthen Presence by making the virtual experience feel more real through multiple senses. The X-ray visualisation provides visual feedback that goes beyond what is possible in reality (augmented presence), while the haptic manikin provides physical touch feedback that matches the visual actions, creating cross-modal immersion.

---

## Data Collection for Immersion: Matching Measures to Goals (TTSH)

In the TTSH blood-taking case study, the data collection question "I felt I had everything under control during the procedure" is linked to a specific immersion dimension and practical outcome. Which pairing is correct?

A. Presence, linked to spatial awareness
B. Flow (Engagement and Mastery), linked to muscle memory and fewer mistakes
C. Cybersickness, linked to comfort during the procedure
D. Effectiveness, linked to task completion rate

> Correct Answer: B. Flow (Engagement and Mastery), linked to muscle memory and fewer mistakes
> Overall Feedback: The TTSH case study maps the feeling of control to Flow, a key component of immersion. The practical outcome is muscle memory and fewer mistakes, showing how the immersive state during training translates into real-world skill development. This demonstrates that immersion is not just about feeling present, but about enabling deeper learning.

---

## Case Study Pattern: Designing for Immersion

Both the research case studies and Sean's enterprise case studies follow a consistent methodology centred on immersion. What is the correct order of the pipeline demonstrated?

A. Implement then Design then Evaluate then Analyse
B. Design immersion goals from stakeholder needs, then Implement to support those goals, then Collect data appropriate to each immersion dimension, then Analyse conclusions
C. Analyse then Collect data then Design then Implement
D. Implement then Collect data then Design then Analyse

> Correct Answer: B. Design immersion goals from stakeholder needs, then Implement to support those goals, then Collect data appropriate to each immersion dimension, then Analyse conclusions
> Overall Feedback: Every case study follows the same immersion-centred pipeline: identify stakeholders, define experiential goals (Presence, Flow, Cybersickness), translate those into implementation decisions that serve each goal, collect data using measures matched to each immersion dimension, and analyse whether the immersion goals were met.

---

## Enterprise Immersive Training: Four Benefit Areas

Sean's presentation highlighted four key benefit areas of immersive enterprise training. Which of the following is NOT one of those four areas?

A. Lower costs and better outcomes through deeper immersive experiences
B. Safety at scale by simulating dangerous scenarios in an immersive environment
C. Faster internet connectivity for streaming VR content
D. Soft skills through immersive MR experiences like walking in colleagues' footsteps
E. Hard skills through immersive learning that boosts performance

> Correct Answer: C. Faster internet connectivity for streaming VR content
> Overall Feedback: The four benefit areas are: (1) lower costs and better outcomes through immersive experiences, (2) safety at scale by immersing trainees in simulated dangerous scenarios, (3) soft skills through MR experiences that build empathy by immersing you in others' perspectives, and (4) hard skills through immersive learning that increases competence. All four leverage immersion as the core mechanism for improved training outcomes.

---
