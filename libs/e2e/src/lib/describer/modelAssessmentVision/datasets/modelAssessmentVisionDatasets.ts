// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IModelAssessmentData } from "../IModelAssessmentData";

import { FridgeImageClassificationModelDebugging } from "./FridgeImageClassificationModelDebugging";
import { FridgeMultilabelModelDebugging } from "./FridgeMultilabelModelDebugging";
import { FridgeObjectDetectionModelDebugging } from "./FridgeObjectDetectionModelDebugging";

const modelAssessmentVisionDatasets: { [name: string]: IModelAssessmentData } =
  {
    FridgeImageClassificationModelDebugging,
    FridgeMultilabelModelDebugging,
    FridgeObjectDetectionModelDebugging
  };

const withType: {
  [key in keyof typeof modelAssessmentVisionDatasets]: IModelAssessmentData;
} = modelAssessmentVisionDatasets;

export { withType as modelAssessmentVisionDatasets };