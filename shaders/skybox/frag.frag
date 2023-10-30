#version 300 es

precision highp float;

in vec3 localPos;

out vec4 fragColor;

uniform vec3 cameraPos;
uniform sampler2D hdr;
uniform samplerCube cubemap;

vec2 getSphericalUV(vec3 v) {
	v *= vec3(1.0, -1.0, 1.0);
	const vec2 invAtan = vec2(0.1591, 0.3183);
    vec2 uv = vec2(atan(v.z, v.x), asin(v.y));
    uv *= invAtan;
    uv += 0.5;
    return uv;
}

vec3 rgbeToHDR(vec4 rgbe) {
	return rgbe.xyz * pow(2.0, rgbe.w * 255.0 - 128.0);
}

vec4 sampleHDR(vec3 v) {
	return texture(hdr, getSphericalUV(v));
}

void main() {
	vec3 col1 = rgbeToHDR( sampleHDR(normalize(localPos)) );
	vec3 col2 = textureLod(cubemap, normalize(localPos), 3.0).xyz;
	
	vec3 col = mix(col1, col2, 0.0);
	col = col / (col + vec3(1.0));
	col = pow(col, vec3(1.0/2.2)); 
	fragColor = vec4(col, 1.0);
}