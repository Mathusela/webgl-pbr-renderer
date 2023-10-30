#version 300 es

layout(location=0) in vec3 vPos;

uniform mat4 projection;
uniform mat4 view;

out vec3 localPos;

void main() {
	localPos = vPos;

	gl_Position = (projection * mat4(mat3(view)) * vec4(vPos, 1.0)).xyww;
}