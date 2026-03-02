# Week 02 Quiz: 3D Graphics Pipeline (2 Questions)

---

## Graphics Pipeline: Vertex Processing

**What is the primary purpose of the vertex shader in the graphics pipeline?**

A. Rasterizing triangles into pixels
B. Transforming vertex positions from model space to screen space
C. Applying textures to surfaces
D. Computing lighting for each pixel

> Correct Answer: B. Transforming vertex positions from model space to screen space
> Overall Feedback: The vertex shader transforms each vertex from object/model space through world space and view space to clip space. Rasterization, texturing, and per-pixel lighting happen in later stages.

---

## Graphics Pipeline: Fragment Shader

time_limit: 25

Consider the following GLSL fragment shader:

```glsl
void main() {
    vec3 color = texture(diffuseMap, uv).rgb;
    float light = max(dot(normal, lightDir), 0.0);
    gl_FragColor = vec4(color * light, 1.0);
}
```

**What lighting model does this shader implement?**

A. Ambient only
B. Lambertian (diffuse) reflection
C. Phong specular reflection
D. Physically-based rendering (PBR)

> Correct Answer: B. Lambertian (diffuse) reflection
> Overall Feedback: The dot product of the surface normal and light direction, clamped to zero, is the classic Lambertian diffuse reflectance formula. There is no ambient term, specular highlight, or roughness/metalness calculation.

---
