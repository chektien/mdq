# Week 02 Sample Quiz (2 Questions)

---

## Graphics: Pipeline

**Which stage transforms vertices?**

A. Vertex shader
B. Fragment shader
C. Post-process
D. Audio mixer

> Correct Answer: A
> Overall Feedback: Vertex shaders transform vertex positions.

---

## Graphics: Fragment Lighting

time_limit: 25

Consider this shader snippet:

```glsl
vec3 normal = normalize(vNormal);
vec3 lightDir = normalize(uLightPos - vWorldPos);
float lambert = max(dot(normal, lightDir), 0.0);
vec3 color = baseColor * lambert;
```

**A dot(normal, lightDir) term primarily models what?**

A. Specular highlights
B. Diffuse Lambertian shading
C. Tone mapping
D. Shadow map projection

> Correct Answer: B
> Overall Feedback: The dot product models diffuse Lambertian response.

---
