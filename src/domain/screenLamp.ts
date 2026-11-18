import { z } from 'zod';

export const MAX_SCREEN_LAMPS = 2;
export const SCREEN_LAMP_SIZE = { width: 0.45, height: 0.04, depth: 0.075 } as const;
export const screenLampSchema = z.object({
  monitorId: z.string().min(1).max(100),
  enabled: z.boolean(),
  brightness: z.number().finite().min(0).max(100),
  temperature: z.number().finite().min(2700).max(6500),
  tilt: z.number().finite().min(0).max(45),
  horizontalAngle: z.number().finite().min(60).max(110),
  verticalAngle: z.number().finite().min(20).max(55),
  softness: z.number().finite().min(0.05).max(0.35),
});
export type ScreenLampSettings = z.infer<typeof screenLampSchema>;
export function defaultLampSettings(monitorId: string): ScreenLampSettings {
  return {
    monitorId,
    enabled: true,
    brightness: 60,
    temperature: 4000,
    tilt: 25,
    horizontalAngle: 90,
    verticalAngle: 35,
    softness: 0.15,
  };
}

// Domain errors are safe to show at every UI entry point, unlike raw Zod errors.
export class EditorError extends Error {}
export function editorErrorMessage(error: unknown, fallback: string): string {
  return error instanceof EditorError ? error.message : fallback;
}
