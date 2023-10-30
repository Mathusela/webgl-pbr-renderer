#version 300 es

layout(location=0) in vec3 vPos;
layout(location=1) in vec3 vNorm;
layout(location=2) in vec3 vTan;
layout(location=3) in vec3 vBitan;
layout(location=4) in vec2 vUV;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;

out vec3 fPos;
out vec3 fNorm;
out vec2 fUV;
out mat3 TBN;

void main() {
	fPos = vec3(model * vec4(vPos, 1.0));
	fNorm = vNorm;
	fUV = vUV;

	vec3 T = normalize(vec3(model * vec4(vTan, 0.0)));
	vec3 N = normalize(vec3(model * vec4(vNorm, 0.0)));
	vec3 B = normalize(vec3(model * vec4(vBitan, 0.0)));
	// vec3 B = cross(N, T);
	TBN = mat3(T, B, N);

	gl_Position = projection * view * model * vec4(vPos, 1.0);
}