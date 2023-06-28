// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { localization } from "@responsible-ai/localization";
import { SeriesOptionsType } from "highcharts";
import { orderBy, sortBy, sum, zipWith } from "lodash";

import { IDataset } from "../Interfaces/IDataset";

export interface IROCData {
  falsePositiveRates: number[];
  truePositiveRates: number[];
}

function getStaticROCData(): SeriesOptionsType[] {
  return [
    {
      data: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 }
      ],
      name: localization.Interpret.Charts.Ideal,
      type: "line"
    },
    {
      data: [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ],
      name: localization.Interpret.Charts.Random,
      type: "line"
    }
  ];
}

export function calculateROCData(
  probabilityY: number[],
  trueY: number[]
): IROCData {
  const rocData: IROCData = {
    falsePositiveRates: [],
    truePositiveRates: []
  };

  const yData = zipWith(
    probabilityY as number[],
    trueY as number[],
    (probY, trueY) => {
      return {
        // TODO: confirm that it's probability that y == 1
        probabilityY: probY[1],
        trueY
      };
    }
  );
  const totalPositives = sum(trueY);
  const totalNegatives = trueY.length - totalPositives;
  const sortedY = sortBy(yData, ["probabilityY"]);
  // TODO: remove duplicates of values
  let i = 0;
  while (i < sortedY.length) {
    let truePositives = 0;
    let falsePositives = 0;
    for (const y of sortedY) {
      if (y.trueY) {
        // need some check for predicted ???
        if (y.probabilityY >= sortedY[i].probabilityY) {
          truePositives++;
        } else {
          falsePositives++;
        }
      }
    }
    const tpr = truePositives / totalPositives;
    const fpr = falsePositives / totalNegatives;
    rocData.truePositiveRates.push(tpr);
    rocData.falsePositiveRates.push(fpr);
    i++;
  }
  console.log(rocData);
  return rocData;
}

export function calculateAUCData(dataset: IDataset): SeriesOptionsType[] {
  if (!dataset.probability_y) {
    // TODO: show warning message
    return [...getStaticROCData()];
  }
  console.log(dataset.true_y);
  const rocData = calculateROCData(
    // TODO: remove cast
    dataset.probability_y as unknown as number[],
    dataset.true_y as number[]
  );
  const data = zipWith(
    rocData.falsePositiveRates,
    rocData.truePositiveRates,
    (fpr, tpr) => {
      return { x: fpr, y: tpr };
    }
  );
  const allData = [
    {
      data: orderBy(data, ["x"]),
      name: "AUC",
      type: "line"
    },
    ...getStaticROCData()
  ];
  return allData as SeriesOptionsType[];
}

// export function getROCData(trueLabels: number[], predictedProbabilities: number[]): any[] {
//   let truePositive = 0;
//   let falsePositive = 0;
//   const truePositiveRates = [];
//   const falsePositiveRates = [];
//   let prevF = Number.NEGATIVE_INFINITY;
//   // Based on: Tom Fawcett's "An introduction to ROC analysis.", http://academic.research.microsoft.com/Paper/2173957
//   const sortedIndices = predictedProbabilities.sort().map((_, idx) => idx);

//   for (let elem = 0; elem < predictedProbabilities.length; elem++) {
//     const trueLabel = trueLabels[sortedIndices[elem]];
//     const predLabel = predictedProbabilities[sortedIndices[elem]];
//   }

// }

export function computeAUC(
  trueLabels: number[],
  predictedProbabilities: number[]
): number {
  // Based on: Tom Fawcett's "An introduction to ROC analysis.", http://academic.research.microsoft.com/Paper/2173957
  const sortedIndices = predictedProbabilities.sort().map((_, idx) => idx);

  let area = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let prevTruePositive = 0;
  let prevFalsePositive = 0;
  let fPrev = Number.NEGATIVE_INFINITY;

  for (let elem = 0; elem < predictedProbabilities.length; elem++) {
    const trueLabel = trueLabels[sortedIndices[elem]];
    const predLabel = predictedProbabilities[sortedIndices[elem]];

    if (!predLabel || !trueLabel) {
      continue;
    }
    if (Math.abs(predLabel - fPrev) > Number.EPSILON) {
      area += trapz(
        falsePositive,
        prevFalsePositive,
        truePositive,
        prevTruePositive
      );
      fPrev = predLabel;
      prevFalsePositive = falsePositive;
      prevTruePositive = truePositive;
    }

    if (trueLabel > 0) {
      truePositive += 1;
    }

    if (trueLabel <= 0) {
      falsePositive += 1;
    }
  }

  area += trapz(
    falsePositive,
    prevFalsePositive,
    truePositive,
    prevTruePositive
  );

  // RS: Account for numerical inaccuracies in integration that might cause AUC to be > 1
  return Math.min(
    1,
    truePositive * falsePositive !== 0
      ? area / (truePositive * falsePositive)
      : 0
  );
}

function trapz(x1: number, x2: number, y1: number, y2: number): number {
  return 0.5 * Math.abs(x1 - x2) * (y1 + y2);
}
