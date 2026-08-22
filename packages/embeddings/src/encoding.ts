export function encodeFloat32ToBase64(vector: number[]): string {
  const floatArray = new Float32Array(vector);
  const buffer = Buffer.from(
    floatArray.buffer,
    floatArray.byteOffset,
    floatArray.byteLength,
  );
  return buffer.toString("base64");
}

export function decodeBase64ToFloat32(base64: string): number[] {
  const buffer = Buffer.from(base64, "base64");
  const floatArray = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return Array.from(floatArray);
}

export function formatVectorOutput(
  vector: number[],
  encodingFormat: "float" | "base64",
): number[] | string {
  if (encodingFormat === "base64") {
    return encodeFloat32ToBase64(vector);
  }
  return vector;
}
