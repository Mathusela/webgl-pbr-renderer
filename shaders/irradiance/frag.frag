#version 300 es

precision highp float;

#define SAMPLE_DELTA 0.025

#define PI 3.14159265

in vec3 localPos;

out vec4 fragColor;

uniform vec3 cameraPos;
uniform sampler2D hdr;

vec2 getSphericalUV(vec3 v) {
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
	vec3 normal = normalize(localPos * vec3(1.0, 1.0, -1.0));

	vec3 irradiance = vec3(0.0);

	vec3 up		= vec3(0.0, 1.0, 0.0);
	vec3 right	= normalize(cross(up, normal));
	up			= normalize(cross(normal, right));

	float numSamples = 0.0;

	for (float phi = 0.0; phi < 2.0 * PI; phi += SAMPLE_DELTA) {
		for (float theta = 0.0; theta < 0.5 * PI; theta += SAMPLE_DELTA) {
			vec3 tangentSample = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
			vec3 sampleVec = tangentSample.x * right + tangentSample.y * up + tangentSample.z * normal;

			irradiance += rgbeToHDR( sampleHDR(sampleVec) ) * sin(theta) * cos(theta);
			numSamples++;
		}
	}

	irradiance = PI * irradiance * (1.0 / float(numSamples));
	fragColor = vec4(irradiance, 1.0);
}