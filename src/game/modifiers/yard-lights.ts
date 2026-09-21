/** Prison yard: recess ↔ lockdown with searchlights + border lasers. */

import type { Ball, Hoop, World } from "../types";
import type { ModifierHost, StageModifier, YardLightsHud } from "../modifiers";
import { artImage } from "../art";
import {
  coneGeometry,
  drawSearchlightBeam,
  lightForSide,
  loadSearchlightLayout,
  majorLocalAngle,
  placementEmit,
  placementPivot,
  spriteSize,
  wallQuad,
  worldBeamAngle,
  type SearchlightLayout,
  type SearchlightPlacement,
  type WallQuad,
} from "../searchlight-layout";
