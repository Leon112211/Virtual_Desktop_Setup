import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  Quaternion,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
} from 'three';

// Relative preview intensity, not a measured product's luminous flux. Split this
// total between the two samples; tune only this constant during visual review.
export const SCREEN_LAMP_REFERENCE_INTENSITY = 4;
export const SCREEN_LAMP_COOKIE_SIZE = 256;
export const SCREEN_LAMP_DISTANCE = 2;
export const SCREEN_LAMP_SOURCE_Y = 0.019;
export const SCREEN_LAMP_SOURCE_Z = 0.039;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function screenLampSampleIntensity(brightness: number) {
  return (SCREEN_LAMP_REFERENCE_INTENSITY * brightness) / 100 / 2;
}

export function screenLampSamplePositions(length: number): [Vector3, Vector3] {
  return [
    new Vector3(-length / 4, SCREEN_LAMP_SOURCE_Y, SCREEN_LAMP_SOURCE_Z),
    new Vector3(length / 4, SCREEN_LAMP_SOURCE_Y, SCREEN_LAMP_SOURCE_Z),
  ];
}

export function screenLampBasis(tilt: number, worldRotation?: Quaternion) {
  const angle = radians(tilt);
  const direction = new Vector3(0, -Math.cos(angle), Math.sin(angle));
  const up = new Vector3(0, Math.sin(angle), Math.cos(angle));
  const horizontal = new Vector3(1, 0, 0);
  if (worldRotation) {
    direction.applyQuaternion(worldRotation);
    up.applyQuaternion(worldRotation);
    horizontal.applyQuaternion(worldRotation);
  }
  return { direction, up, horizontal };
}

// Full rectangular angular widths -> an enclosing circular cone half-angle.
// The small margin keeps the rectangular corners inside the circular projection.
export function screenLampConeAngle(horizontalAngle: number, verticalAngle: number) {
  return Math.atan(
    1.02 * Math.hypot(Math.tan(radians(horizontalAngle / 2)), Math.tan(radians(verticalAngle / 2))),
  );
}

function edgeTransmission(relativeDistance: number, softness: number) {
  const t = Math.max(0, Math.min(1, (Math.abs(relativeDistance) - (1 - softness)) / softness));
  return 1 - t * t * (3 - 2 * t);
}

// x/y are tangent-plane coordinates (angular tangents), not UVs or metres.
export function screenLampTransmission(
  x: number,
  y: number,
  horizontalAngle: number,
  verticalAngle: number,
  softness: number,
) {
  const a = Math.tan(radians(horizontalAngle / 2));
  const b = Math.tan(radians(verticalAngle / 2));
  return edgeTransmission(x / a, softness) * edgeTransmission(y / b, softness);
}

export function createScreenLampCookie(
  horizontalAngle: number,
  verticalAngle: number,
  softness: number,
) {
  const size = SCREEN_LAMP_COOKIE_SIZE;
  const data = new Uint8Array(size * size * 4);
  const extent = Math.tan(screenLampConeAngle(horizontalAngle, verticalAngle));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const value = border
        ? 0
        : Math.round(
            255 *
              screenLampTransmission(
                (((x + 0.5) / size) * 2 - 1) * extent,
                (((y + 0.5) / size) * 2 - 1) * extent,
                horizontalAngle,
                verticalAngle,
                softness,
              ),
          );
      const index = (y * size + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = value;
      data[index + 3] = 255; // Three multiplies spotColor.rgb, not its alpha.
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.name = '屏幕挂灯矩形配光';
  texture.colorSpace = NoColorSpace; // Already-linear attenuation, not a colour image.
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// Approximate black-body colour, intentionally not a calibrated spectral model.
// The approximation yields sRGB values; convert once for Three's linear lights.
export function screenLampColor(temperature: number) {
  const t = Math.max(2700, Math.min(6500, Number.isFinite(temperature) ? temperature : 4000)) / 100;
  const clamp = (value: number) => Math.max(0, Math.min(255, value)) / 255;
  return new Color().setRGB(
    1,
    clamp(99.4708025861 * Math.log(t) - 161.1195681661),
    clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307),
    SRGBColorSpace,
  );
}

// Only centre and corner rays: these are illustrative guides, not a volume or
// an occlusion simulation. Use the same basis/angles as the actual projection.
export function screenLampGuideVertices(
  length: number,
  tilt: number,
  horizontalAngle: number,
  verticalAngle: number,
) {
  const { direction, up, horizontal } = screenLampBasis(tilt);
  const a = Math.tan(radians(horizontalAngle / 2));
  const b = Math.tan(radians(verticalAngle / 2));
  const vertices: number[] = [];
  for (const source of screenLampSamplePositions(length)) {
    for (const [x, y] of [
      [0, 0],
      [-a, -b],
      [-a, b],
      [a, -b],
      [a, b],
    ]) {
      const end = direction
        .clone()
        .addScaledVector(horizontal, x)
        .addScaledVector(up, y)
        .normalize()
        .multiplyScalar(0.75)
        .add(source);
      vertices.push(...source.toArray(), ...end.toArray());
    }
  }
  return new Float32Array(vertices);
}
