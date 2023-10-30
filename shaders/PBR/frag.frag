#version 300 es

precision highp float;

#define MAX_LIGHTS 25
#define MIN_PARALAX_LAYERS 8.0
#define MAX_PARALAX_LAYERS 32.0
#define MAX_PARALAX_SELF_SHADOW_LAYERS MAX_PARALAX_LAYERS
#define PARALAX_DEPTH 0.05
// #define PARALAX_DEPTH 0.1

#define PI 3.14159265

in vec3 fNorm;
in vec3 fPos;
in vec2 fUV;
in mat3 TBN;

out vec4 fragColor;

struct Light {
	vec3 position;
	vec3 power;
};

uniform vec3 cameraPos;
uniform Light lights[MAX_LIGHTS];
uniform int lightsCount;

uniform sampler2D albedoMap;
uniform sampler2D roughnessMap;
uniform sampler2D normalMap;
uniform sampler2D displacementMap;
uniform sampler2D aoMap;
uniform samplerCube hdr;
uniform float materialMetallic;
uniform float materialRoughness;

// float ambient = 0.15;

vec2 parallaxMap(vec2 UV, vec3 viewDir, float scale) {
	viewDir = transpose(TBN) * viewDir;
	float numLayers = mix(MAX_PARALAX_LAYERS, MIN_PARALAX_LAYERS, max(dot(vec3(0.0, 0.0, 1.0), viewDir), 0.0));
	float layerDepth = 1.0 / numLayers;
	float currentDepth = 0.0;

	vec2 p = (viewDir.xy / viewDir.z) * scale;
	vec2 deltaUV = p / numLayers;

	float height = texture(displacementMap, UV).x;
	
	while (currentDepth < height) {
		UV -= deltaUV;
		height = texture(displacementMap, UV).x;
		currentDepth += layerDepth;
	}

	vec2 prevUV = UV + deltaUV;
	float afterHeight = height - currentDepth;
	float beforeHeight = texture(displacementMap, prevUV).x - currentDepth + layerDepth;
	float weight = afterHeight / (afterHeight - beforeHeight);
	UV = prevUV * weight + UV * (1.0 - weight);
	
	return UV;
}

float parallaxSelfShadowing(vec2 parallaxUV, vec3 lightDir, float scale) {
	lightDir = transpose(TBN) * lightDir;
	float d = max(dot(vec3(0.0, 0.0, 1.0), lightDir), 0.0);
	if (d == 0.0) return 1.0;
	float numLayers = mix(MAX_PARALAX_SELF_SHADOW_LAYERS, 1.0, d);
	// float numLayers = 10.0;
	float layerDepth = 1.0 / numLayers;

	float height = texture(displacementMap, parallaxUV).x;
	float currentDepth = height;

	vec2 p = (lightDir.xy / lightDir.z) * scale;
	vec2 deltaUV = p / numLayers;


	while (currentDepth <= height && currentDepth > 0.0) {
		parallaxUV += deltaUV;
		height = texture(displacementMap, parallaxUV).x;
		currentDepth -= layerDepth;
	}

	return float(currentDepth > layerDepth);
}

float PBR_D(vec3 halfwayDir, vec2 UV, vec3 normal) {
	// float roughness = texture(roughnessMap, UV).x;
	float roughness = texture(roughnessMap, UV).x * materialRoughness;
	// float roughness = materialRoughness;
	float n = roughness*roughness;
	float nDh = max(dot(normal, halfwayDir), 0.0);
	float t = (nDh*nDh * (roughness*roughness - 1.0) + 1.0);
	float d = PI * t*t;
	return n / d;
}

float PBR_Gp(vec3 normal, vec3 v, float roughness) {
	float n = max(dot(normal, v), 0.0);
	float d = n * (1.0 - roughness) + roughness;
	return n / d;
}

float PBR_G(vec3 lightDir, vec3 viewDir, vec2 UV, vec3 normal) {
	// float roughness = texture(roughnessMap, UV).x;
	float roughness = texture(roughnessMap, UV).x * materialRoughness;
	// float roughness = materialRoughness;
	float t = roughness + 1.0;
	roughness = t*t / 8.0;
	return PBR_Gp(normal, viewDir, roughness) * PBR_Gp(normal, lightDir, roughness);
}

vec3 PBR_F(vec3 IOR, vec3 viewDir, vec3 halfwayDir, vec2 UV, float metallic) {
	IOR = mix(IOR, texture(albedoMap, UV).xyz, metallic);
	float t = clamp(1.0 - max(dot(halfwayDir, viewDir), 0.0), 0.0, 1.0);
	return IOR + (1.0 - IOR) * pow(t, 5.0);
}

vec3 PBR_FR(vec3 IOR, vec3 viewDir, vec3 normal, vec2 UV, float metallic, float roughness) {
	IOR = mix(IOR, texture(albedoMap, UV).xyz, metallic);
	float t = clamp(1.0 - max(dot(normal, viewDir), 0.0), 0.0, 1.0);
	return IOR + (max(vec3(1.0 - roughness), IOR) - IOR) * pow(t, 5.0);
}   

vec3 PBR_BRDF(vec3 lightDir, vec3 viewDir, vec2 UV, vec3 normal, vec3 IOR, float metallic) {
	vec3 halfwayDir = normalize(lightDir + viewDir);
	float D = PBR_D(halfwayDir, UV, normal);
	vec3 F = PBR_F(IOR, viewDir, halfwayDir, UV, metallic);
	float G = PBR_G(lightDir, viewDir, UV, normal);
	vec3 n =  D * F * G;
	float d = 4.0 * max(dot(viewDir, normal), 0.0) * max(dot(lightDir, normal), 0.0) + 0.0001;
	vec3 specular = n / d;
	vec3 diffuse = texture(albedoMap, UV).xyz / PI;
	diffuse *= (vec3(1.0) - F) * (1.0 - metallic);
	return specular + diffuse;
}

vec3 PBR_radiance(vec3 lightPos, vec3 power) {
	float distance = length(lightPos - fPos);
	return power * (1.0 / (distance * distance));
}

vec3 PBR(vec3 lightPos, vec3 lightPower, vec3 IOR, float metallic, vec3 lightDir, vec3 viewDir, vec2 UV, vec3 normal) {
	vec3 radiance = PBR_radiance(lightPos, lightPower);
	vec3 lighting = PBR_BRDF(lightDir, viewDir, UV, normal, IOR, metallic);
	float nDl = max(dot(normal, lightDir), 0.0);

	float selfShadowing = parallaxSelfShadowing(UV, lightDir, PARALAX_DEPTH);

	vec3 color = ((1.0 - selfShadowing) * lighting * radiance * nDl);
	// vec3 color = ((1.0 - selfShadowing) * lighting * radiance * nDl) + ambient * texture(albedoMap, UV).xyz;

	return color;
}

vec3 PBR_ambient(vec3 IOR, vec3 viewDir, vec3 normal, vec2 UV, float metallic) {
	float roughness = texture(roughnessMap, UV).x * materialRoughness;
	vec3 kD = 1.0 - PBR_FR(IOR, viewDir, normal, UV, metallic, roughness);
	kD *= 1.0 - metallic;
	// vec3 irradiance = texture(hdr, normal).xyz;
	vec3 irradiance = textureLod(hdr, normal, 3.0).xyz;
	vec3 diffuse = irradiance * texture(albedoMap, UV).xyz;
	return kD * diffuse * texture(aoMap, UV).x;
}

void main() {
	vec3 viewDir = normalize(cameraPos - fPos);
	// vec2 UV = fUV;
	vec2 UV = parallaxMap(fUV, viewDir, PARALAX_DEPTH);
	// if (UV.x > 1.0 || UV.y > 1.0 || UV.x < 0.0 || UV.y < 0.0) discard;
	// vec3 unitNormal = normalize(fNorm);
	vec3 unitNormal = normalize(TBN*normalize((texture(normalMap, UV).xyz * 2.0 - 1.0)*vec3(1.0, -1.0, 1.0)));
	
	vec3 ambient = PBR_ambient(vec3(0.04), viewDir, unitNormal, UV, materialMetallic);
	
	vec3 col = vec3(0.0);

	for (int i=0; i<MAX_LIGHTS; i++) {
		if (i >= lightsCount) break;
		vec3 lightPos = lights[i].position;
		vec3 lightPower = lights[i].power;

		vec3 lightDir = normalize(lightPos - fPos);

		// if (gl_FragCoord.x > 1000.0)
			// col += blinnPhong(lightPos, lightDir, viewDir, UV, unitNormal);
		// else
		col += PBR(lightPos, lightPower, vec3(0.04), materialMetallic, lightDir, viewDir, UV, unitNormal);
	}

	col += ambient;

	col = col / (col + vec3(1.0));
	col = pow(col, vec3(1.0/2.2)); 

	fragColor = vec4(col, 1.0);
}