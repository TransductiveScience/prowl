import { NodeProgram } from 'sigma/rendering';
import { floatColor } from 'sigma/utils';
import type { NodeDisplayData, RenderParams } from 'sigma/types';
import type { ProgramInfo, InstancedProgramDefinition } from 'sigma/rendering/utils';

const FLOAT = WebGLRenderingContext.FLOAT;
const UNSIGNED_BYTE = WebGLRenderingContext.UNSIGNED_BYTE;

// Three vertices of an upward-pointing equilateral triangle
const ANGLE_1 = -Math.PI / 2;       // top
const ANGLE_2 = Math.PI / 6;        // bottom-right
const ANGLE_3 = (5 * Math.PI) / 6;  // bottom-left

const VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

const float bias = 255.0 / 254.0;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 3.5;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_diffVector = diffVector;
  v_radius = size / 2.0;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;

const FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);
const float SQRT3 = 1.7320508;

// SDF for an equilateral triangle centred at origin, pointing up
float triangleSDF(vec2 p, float r) {
  // r = circumradius; scale so the triangle fills the same visual area
  float s = r * 1.1;
  // Shift so the centroid sits at origin (triangle points up)
  vec2 q = vec2(abs(p.x), -p.y) / s;
  // Equilateral triangle SDF (half-space intersection)
  float d = max(
    q.x * SQRT3 * 0.5 + q.y * 0.5,  // right edge
    -q.y                               // bottom edge
  ) - 0.5;
  return d * s;
}

void main(void) {
  float border = u_correctionRatio * 2.0;
  float dist = triangleSDF(v_diffVector, v_radius) + border;

  #ifdef PICKING_MODE
  if (dist > border)
    gl_FragColor = transparent;
  else
    gl_FragColor = v_color;
  #else
  float t = 0.0;
  if (dist > border)
    t = 1.0;
  else if (dist > 0.0)
    t = dist / border;

  gl_FragColor = mix(v_color, transparent, t);
  #endif
}
`;

type Uniforms = 'u_sizeRatio' | 'u_correctionRatio' | 'u_matrix';

export class NodeTriangleProgram extends NodeProgram<Uniforms> {
  getDefinition(): InstancedProgramDefinition<Uniforms> {
    return {
      VERTICES: 3,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      METHOD: WebGLRenderingContext.TRIANGLES,
      UNIFORMS: ['u_sizeRatio', 'u_correctionRatio', 'u_matrix'] as const,
      ATTRIBUTES: [
        { name: 'a_position', size: 2, type: FLOAT },
        { name: 'a_size', size: 1, type: FLOAT },
        { name: 'a_color', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_id', size: 4, type: UNSIGNED_BYTE, normalized: true },
      ],
      CONSTANT_ATTRIBUTES: [{ name: 'a_angle', size: 1, type: FLOAT }],
      CONSTANT_DATA: [[ANGLE_1], [ANGLE_2], [ANGLE_3]],
    };
  }

  processVisibleItem(nodeIndex: number, startIndex: number, data: NodeDisplayData): void {
    const array = this.array;
    const color = floatColor(data.color);

    array[startIndex++] = data.x;
    array[startIndex++] = data.y;
    array[startIndex++] = data.size;
    array[startIndex++] = color;
    array[startIndex] = nodeIndex;
  }

  setUniforms(params: RenderParams, { gl, uniformLocations }: ProgramInfo<Uniforms>): void {
    const { u_sizeRatio, u_correctionRatio, u_matrix } = uniformLocations;
    gl.uniform1f(u_correctionRatio, params.correctionRatio);
    gl.uniform1f(u_sizeRatio, params.sizeRatio);
    gl.uniformMatrix3fv(u_matrix, false, params.matrix);
  }
}
