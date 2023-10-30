import * as glm from "./gl-matrix/gl-matrix.js";

declare const HDRImage: Function;

type GlmMat4 = ReturnType<typeof glm.mat4.create>;
type GlmVec3 = ReturnType<typeof glm.vec3.create>;

(document.getElementById("gl") as HTMLCanvasElement).width = document.documentElement.clientWidth;
(document.getElementById("gl") as HTMLCanvasElement).height = document.documentElement.clientHeight;
const canvasDimensions = [(document.getElementById("gl") as HTMLCanvasElement).width, (document.getElementById("gl") as HTMLCanvasElement).height] as const;

type Vec3 = [number, number, number];
type VecBuffer = Vec3[];

type ShaderSource = string;

function material(albedoMap?: Texture, roughnessMap?: Texture, normalMap?: Texture, displacementMap?: Texture, aoMap?: Texture, metallic?: number, roughness?: number) {
	return {
		albedoMap: albedoMap,
		roughnessMap: roughnessMap,
		normalMap: normalMap,
		displacementMap: displacementMap,
		aoMap: aoMap,
		metallic: metallic,
		roughness: roughness
	};
}

type Material = ReturnType<typeof material>;

function light(position: Vec3, power: Vec3) {
	return {
		position: position,
		power: power
	};
}

type Light = ReturnType<typeof light>;

interface InputMap {
	[key: string]: boolean;
};


class Texture {
	private ID: WebGLTexture;
	public type: number;

	public setActive(gl: WebGL2RenderingContext, index: number) {
		gl.activeTexture(gl.TEXTURE0 + index);
		gl.bindTexture(this.type, this.ID);
		// gl.bindTexture(gl.TEXTURE_2D, null);
	}

	constructor(gl: WebGL2RenderingContext, url: string, gammaCorrect: boolean = false, manualID: WebGLTexture = 0, textureType: number = gl.TEXTURE_2D) {
		this.type = textureType;

		if (url == "") {
			this.ID = manualID;
			return;
		}


		const texture = gl.createTexture() || 0;
		gl.bindTexture(gl.TEXTURE_2D, texture);

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		
		const internalType = gammaCorrect ? gl.SRGB8_ALPHA8 : gl.RGBA;

		const pixel = new Uint8Array([0, 0, 255, 255]);
		gl.texImage2D(gl.TEXTURE_2D, 0, internalType, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

		const splitURL = url.split(".");
		if (splitURL[splitURL.length-1] == "hdr") {
			const HDR = loadHDR(url);
			HDR.then((res) => {
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, internalType, res.width, res.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, res.data);
				gl.generateMipmap(gl.TEXTURE_2D);
				
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.bindTexture(gl.TEXTURE_2D, null);
			}); 	
		}
		else {
			const image = new Image();
			image.onload = () => {
				// image.width = 100;
				// document.body.appendChild(image);

				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, internalType, gl.RGBA, gl.UNSIGNED_BYTE, image);
				gl.generateMipmap(gl.TEXTURE_2D);

				gl.bindTexture(gl.TEXTURE_2D, null);
			}
			image.src = url;
		}
		
		gl.bindTexture(gl.TEXTURE_2D, null);

		this.ID = texture;
	}
}

class Camera {
	private viewMatrix: GlmMat4 = glm.mat4.create();
	private projectionMatrix: GlmMat4;
	private position: GlmVec3 = glm.vec3.create();
	private rotation: GlmVec3 = glm.vec3.create();

	private genViewMatrix() {
		this.viewMatrix = glm.mat4.create();
		glm.mat4.rotateX(this.viewMatrix, this.viewMatrix, glm.glMatrix.toRadian(this.rotation[0]));
		glm.mat4.rotateY(this.viewMatrix, this.viewMatrix, glm.glMatrix.toRadian(this.rotation[1]));
		glm.mat4.rotateZ(this.viewMatrix, this.viewMatrix, glm.glMatrix.toRadian(this.rotation[2]));
		const inversePos = glm.vec3.scale(glm.vec3.create(), this.position, -1);
		glm.mat4.translate(this.viewMatrix, this.viewMatrix, inversePos);
	};

	public set pos(newPos: Vec3) {
		this.position = glm.vec3.fromValues(newPos[0], newPos[1], newPos[2]);
		this.genViewMatrix();
	}
	
	public get pos(): Vec3 {
		return [this.position[0], this.position[1], this.position[2]];
	}

	public set rot(newRot: Vec3) {
		this.rotation = glm.vec3.fromValues(newRot[0], newRot[1], newRot[2]);
		this.genViewMatrix();
	}

	public get rot(): Vec3 {
		return [this.rotation[0], this.rotation[1], this.rotation[2]];
	}

	public get viewMat(): GlmMat4 {
		return this.viewMatrix;
	}

	public get projectionMat(): GlmMat4 {
		return this.projectionMatrix;
	}

	public moveRelativeToFacing(v: Vec3) {
		let r = glm.vec4.fromValues(v[0], v[1], v[2], 0.0);
		let rot = glm.mat4.create();
		// glm.mat4.rotateX(rot, rot, glm.glMatrix.toRadian(this.rotation[0]));
		glm.mat4.rotateY(rot, rot, glm.glMatrix.toRadian(this.rotation[1]));
		glm.mat4.rotateZ(rot, rot, glm.glMatrix.toRadian(this.rotation[2]));
		glm.mat4.multiply(r, rot, r);
		this.pos = [this.pos[0]+r[0], this.pos[1]+r[1], this.pos[2]-r[2]];
	}

	constructor (position: Vec3, width: number = canvasDimensions[0], height: number = canvasDimensions[1]) {
		this.projectionMatrix = glm.mat4.perspective(glm.mat4.create(), glm.glMatrix.toRadian(90.0), width/height, 0.1, 100.0);
		this.pos = position;
	}
}

class ShaderProgram {
	private vertexSource: string;
	private fragmentSource: string;
	private id: WebGLProgram;

	public get getID() : WebGLProgram {
		return this.id;
	}	

	private createShader(gl: WebGL2RenderingContext, shaderType: number, source: ShaderSource): WebGLShader {
		const id = gl.createShader(shaderType) || 0;
		gl.shaderSource(id, source);
		gl.compileShader(id);

		var errorLog = gl.getShaderInfoLog(id);
		if (errorLog) console.log(errorLog);

		return id;
	}

	constructor (gl: WebGL2RenderingContext, shaders: [ShaderSource, ShaderSource]) {
		this.vertexSource = shaders[0];
		this.fragmentSource = shaders[1];

		const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, this.vertexSource);
		const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, this.fragmentSource);

		const shaderProgram = gl.createProgram() || 0;
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);

		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		
		this.id = shaderProgram;
	}
}

class Mesh {
	private vecBuffer: number[];
	private VAO: WebGLBuffer;
	private VBO: WebGLVertexArrayObject;

	public draw(gl: WebGL2RenderingContext, shaderProgram: WebGLProgram, material: Material, modelMatrix: GlmMat4, camera: Camera, hdr: Texture) {
		gl.bindVertexArray(this.VAO);
		gl.useProgram(shaderProgram);

		gl.uniform1i(gl.getUniformLocation(shaderProgram, "albedoMap"), 0);
		material.albedoMap?.setActive(gl, 0);
		gl.uniform1i(gl.getUniformLocation(shaderProgram, "roughnessMap"), 1);
		material.roughnessMap?.setActive(gl, 1);
		gl.uniform1i(gl.getUniformLocation(shaderProgram, "normalMap"), 2);
		material.normalMap?.setActive(gl, 2);
		gl.uniform1i(gl.getUniformLocation(shaderProgram, "displacementMap"), 3);
		material.displacementMap?.setActive(gl, 3);
		gl.uniform1i(gl.getUniformLocation(shaderProgram, "aoMap"), 4);
		material.aoMap?.setActive(gl, 4);

		gl.uniform1i(gl.getUniformLocation(shaderProgram, "hdr"), 5);
		hdr.setActive(gl, 5);

		gl.uniform1f(gl.getUniformLocation(shaderProgram, "materialMetallic"), material.metallic || 0.0);
		gl.uniform1f(gl.getUniformLocation(shaderProgram, "materialRoughness"), material.roughness || 1.0);

		gl.uniformMatrix4fv(gl.getUniformLocation(shaderProgram, "model"), false, modelMatrix);
		gl.uniformMatrix4fv(gl.getUniformLocation(shaderProgram, "view"), false, camera.viewMat);
		gl.uniformMatrix4fv(gl.getUniformLocation(shaderProgram, "projection"), false, camera.projectionMat);
		gl.uniform3fv(gl.getUniformLocation(shaderProgram, "cameraPos"), camera.pos);
		
		gl.uniform1i(gl.getUniformLocation(shaderProgram, "lightsCount"), lights.length);
		for (let i=0; i<lights.length; i++) {
			gl.uniform3fv(gl.getUniformLocation(shaderProgram, `lights[${i}].position`), glm.vec3.fromValues(lights[i].position[0], lights[i].position[1], lights[i].position[2]));
			gl.uniform3fv(gl.getUniformLocation(shaderProgram, `lights[${i}].power`), glm.vec3.fromValues(lights[i].power[0], lights[i].power[1], lights[i].power[2]));
		}

		gl.drawArrays(gl.TRIANGLES, 0, this.vecBuffer.length/14);
	}

	constructor (gl: WebGL2RenderingContext, vecBuffer: VecBuffer) {
		const formatted = [];
		for (let tuple of vecBuffer) formatted.push(tuple[0], tuple[1], tuple[2]);
		this.vecBuffer = formatted;

		const VAO = gl.createVertexArray() || 0;
		gl.bindVertexArray(VAO);

		const VBO = gl.createBuffer() || 0;
		gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vecBuffer), gl.STATIC_DRAW);

		// Size of float = 4 bytes
		// Positions
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 14*4, 0);
		gl.enableVertexAttribArray(0);

		// Normals
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 14*4, 3*4);
		gl.enableVertexAttribArray(1);

		// Tangents
		gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 14*4, 6*4);
		gl.enableVertexAttribArray(2);

		// Bi-Tangents
		gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 14*4, 9*4);
		gl.enableVertexAttribArray(3);

		// UVs
		gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 14*4, 12*4);
		gl.enableVertexAttribArray(4);

		this.VAO = VAO;
		this.VBO = VBO;
	}
}

class Drawable {
	protected mesh: Mesh;
	public shaderProgram: ShaderProgram;
	private modelMatrix: GlmMat4 = glm.mat4.create();

	public draw(gl: WebGL2RenderingContext, material: Material, camera: Camera, hdr: Texture) {
		this.mesh.draw(gl, this.shaderProgram.getID, material, this.modelMatrix, camera, hdr);
	}

	private position: GlmVec3 = glm.vec3.create();
	
	public set pos(newPos: Vec3) {
		this.position = glm.vec3.fromValues(newPos[0], newPos[1], newPos[2]);
		glm.mat4.translate(this.modelMatrix, glm.mat4.create(), newPos);
		// console.log(this.modelMatrix);
	}
	
	public get pos(): Vec3 {
		return [this.position[0], this.position[1], this.position[2]];
	}

	constructor (gl: WebGL2RenderingContext, vecBuffer: VecBuffer, shaders: [ShaderSource, ShaderSource], position: Vec3) {
		this.mesh = new Mesh(gl, vecBuffer);
		this.shaderProgram = new ShaderProgram(gl, [shaders[0], shaders[1]]);
		this.pos = position;
	}
}

class Entity extends Drawable {}

class Skybox extends Drawable {
	public drawSkybox(gl: WebGL2RenderingContext, camera: Camera, hdr: Texture): void {
		this.draw(gl, material(), camera, hdr);
	}

	constructor (gl: WebGL2RenderingContext, vecBuffer: VecBuffer, shaders: [ShaderSource, ShaderSource]) {
		super(gl, vecBuffer, shaders, [0.0, 0.0, 0.0]);
	}
}

class CubemapGenerator extends Drawable {
	private drawMesh(gl: WebGL2RenderingContext, camera: Camera, hdr: Texture) {
		this.draw(gl, material(), camera, hdr);
	}
	
	public drawCubemap(gl: WebGL2RenderingContext, hdr: Texture, resolution: number) {
		const FBO = gl.createFramebuffer();
		const RBO = gl.createRenderbuffer();

		// Depth attachment
		gl.bindFramebuffer(gl.FRAMEBUFFER, FBO);
		gl.bindRenderbuffer(gl.RENDERBUFFER, RBO);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, resolution, resolution);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, RBO);

		
		// Allocate texture memory
		const cubemap = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
		
		for (let i=0; i<6; i++)
			gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA16F, resolution, resolution, 0, gl.RGBA, gl.FLOAT, null);
		
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		// gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

		// Render cubemap
		const camera = new Camera([0.0, 0.0, 0.0], resolution, resolution);
		const views: Vec3[] = [[0.0, 90.0, 0.0], [0.0, -90.0, 0.0], [90.0, 0.0, 0.0], [-90.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 180.0, 0.0]];

		gl.viewport(0, 0, resolution, resolution);
		
		for (let i=0; i<6; i++) {
			camera.rot = views[i];
			
			// Color attachment
			// console.log(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, cubemap, 0);
			
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			this.drawMesh(gl, camera, hdr);
		}

		this.drawMesh(gl, camera, hdr);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.deleteFramebuffer(FBO);

		gl.viewport(0, 0, canvasDimensions[0], canvasDimensions[1]);

		gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
		gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

		return new Texture(gl, "", false, cubemap!, gl.TEXTURE_CUBE_MAP);
	}

	constructor (gl: WebGL2RenderingContext, vecBuffer: VecBuffer, shaders: [ShaderSource, ShaderSource]) {
		super(gl, vecBuffer, shaders, [0.0, 0.0, 0.0]);
	}
}

// Read external coords
async function readCoords(path: string): Promise<VecBuffer> {
	const arr: number[] = removeWhitespace(await readFile(path)).split(",").map((x) => Number(x));
	
	let out: VecBuffer = [];
	for (let i = 0; i < arr.length/3; i++) {
		out.push([arr[i*3], arr[i*3+1], arr[i*3+2]]);
	}

	return out;
}

// Remove whitespace
function removeWhitespace(str: string): string {
	return str.replace(" ", "").replace("\t", "").replace("\r", "").replace("\n", "").split(" ").join("");
}

// Read text file
async function readFile(path: string): Promise<string> {
	const res = await fetch(path);
	return res.text()
}

interface HDRData {
	data: Uint8Array;
	width: number;
	height: number;
};

async function loadHDR(path: string): Promise<HDRData> {
	return new Promise((resolve, reject) => {
		const HDR = HDRImage();
		HDR.src = path;
		HDR.onload = () => {
			resolve({data: HDR.dataRGBE, width: HDR.width, height: HDR.height});
		} 
	});
}

// GLOBAL!!!
let lights: Light[] = [light([-2.0, 3.0, 2.0], [40.0, 40.0, 40.0]), light([2.0, 3.0, 2.0], [40.0, 40.0, 40.0])];
// let lights: Light[] = [];

// Main
window.onload = async () => {
	const canvas = document.getElementById("gl") as HTMLCanvasElement;
	const gl = canvas.getContext("webgl2", {powerPreference: 'high-performance'});
	if (!gl) return -1;
	const ext = gl.getExtension("EXT_color_buffer_float");
	if (!ext) return -1;

	gl.enable(gl.DEPTH_TEST);
	gl.depthFunc(gl.LEQUAL); 
	
	const cube = new Entity(gl, await readCoords("coords/cube.txt"), [await readFile("shaders/PBR/vert.vert"), await readFile("shaders/PBR/frag.frag")], [0.0, 0.0, -2.0]);
	const plane = new Entity(gl, await readCoords("coords/plane.txt"), [await readFile("shaders/PBR/vert.vert"), await readFile("shaders/PBR/frag.frag")], [0.0, 0.0, -2.0]);

	const camera = new Camera([0.0, 0.0, 0.0]);
	
	const hdr = new Texture(gl, "./resources/HDR/attic.hdr");
	const skybox = new Skybox(gl, await readCoords("coords/cube.txt"), [await readFile("shaders/skybox/vert.vert"), await readFile("shaders/skybox/frag.frag")]);
	const irradianceMapGenerator = new CubemapGenerator(gl, await readCoords("coords/cube.txt"), [await readFile("shaders/irradiance/vert.vert"), await readFile("shaders/irradiance/frag.frag")]);
	const irradianceMap = irradianceMapGenerator.drawCubemap(gl, hdr, 35);

	const albedoMap = new Texture(gl, "./resources/pavement/diffuse.jpg", true);
	const roughnessMap = new Texture(gl, "./resources/pavement/roughness.jpg");
	const normalMap = new Texture(gl, "./resources/pavement/normal.jpg");
	const displacementMap = new Texture(gl, "./resources/pavement/displacement.jpg");
	const aoMap = new Texture(gl, "./resources/pavement/ao.jpg");

	const ralbedoMap = new Texture(gl, "./resources/rockDiffuse.jpg", true);
	const rroughnessMap = new Texture(gl, "./resources/rockRoughness.png");
	const rnormalMap = new Texture(gl, "./resources/rockNormal.png");
	const rdisplacementMap = new Texture(gl, "./resources/rockDisplacement.png");

	const mat = material(albedoMap, roughnessMap, normalMap, displacementMap, aoMap, 0.0, 1.0);
	const rmat = material(ralbedoMap, rroughnessMap, rnormalMap, rdisplacementMap, aoMap, 0.0, 1.0);

	var inputMap: InputMap = {};

	// Gameloop
	setInterval(() => {
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		// Input
		doInput();

		// lights = [light([1.0, Math.cos(Date.now()/1000)*1, 1.0], [100.0, 0.0, 0.0])];
		
		cube.draw(gl, rmat, camera, irradianceMap);
		plane.draw(gl, mat, camera, irradianceMap);

		gl.useProgram(skybox.shaderProgram.getID);
		gl.uniform1i(gl.getUniformLocation(skybox.shaderProgram.getID, "cubemap"), 7);
		irradianceMap.setActive(gl, 7);
		skybox.drawSkybox(gl, camera, hdr);
	}, 1000/60);

	// Input
	function doInput() {
		const defaultSpeed = 0.04;
		const slowSpeed = 0.01;
		let speed = defaultSpeed;
		const rotSpeed = 2;
		
		if (inputMap["f"])
			speed = slowSpeed;
		
		if (inputMap["w"])
			camera.moveRelativeToFacing([0.0, 0.0, speed]);
		if (inputMap["s"]) 
			camera.moveRelativeToFacing([0.0, 0.0, -speed]);
		if (inputMap["a"])
			camera.moveRelativeToFacing([-speed, 0.0, 0.0]);
		if (inputMap["d"])
			camera.moveRelativeToFacing([speed, 0.0, 0.0]);
		if (inputMap[" "])
			camera.pos = [camera.pos[0], camera.pos[1]+speed, camera.pos[2]];
		if (inputMap["Shift"])
			camera.pos = [camera.pos[0], camera.pos[1]-speed, camera.pos[2]];

		if (inputMap["ArrowLeft"])
			camera.rot = [camera.rot[0], camera.rot[1]-rotSpeed, camera.rot[2]];
		if (inputMap["ArrowRight"])
			camera.rot = [camera.rot[0], camera.rot[1]+rotSpeed, camera.rot[2]];
		if (inputMap["ArrowUp"])
			camera.rot = [camera.rot[0]-rotSpeed, camera.rot[1], camera.rot[2]];
		if (inputMap["ArrowDown"])
			camera.rot = [camera.rot[0]+rotSpeed, camera.rot[1], camera.rot[2]];

		const changeVal = 0.01;
		if (inputMap["p"])
			if (mat.roughness! <= 1.0 - changeVal) mat.roughness! += changeVal;
		if (inputMap["o"])
			if (mat.roughness! >= 0.0 + changeVal) mat.roughness! -= changeVal;
		if (inputMap["l"])
			if (mat.metallic! <= 1.0 - changeVal) mat.metallic! += changeVal;
		if (inputMap["k"])
			if (mat.metallic! >= 0.0 + changeVal) mat.metallic! -= changeVal;
		let c = document.getElementById("dev-info")!.children;
		c[0].innerHTML = `Roughness: ${mat.roughness!.toFixed(2)}`;
		c[1].innerHTML = `Metallic: ${mat.metallic!.toFixed(2)}`;
	}

	canvas.addEventListener("keydown", (e) => {
		let key = e.key.length == 1 ? e.key.toLowerCase() : e.key;
		inputMap[key] = true;
	});

	canvas.addEventListener("keyup", (e) => {
		let key = e.key.length == 1 ? e.key.toLowerCase() : e.key;
		inputMap[key] = false;
	});
}