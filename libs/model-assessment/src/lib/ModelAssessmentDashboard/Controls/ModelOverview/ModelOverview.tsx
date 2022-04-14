// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  MissingParametersPlaceholder,
  defaultModelAssessmentContext,
  ModelAssessmentContext,
  OverallMetricChart,
  BinaryClassificationMetrics,
  RegressionMetrics,
  classificationTask,
  FabricStyles,
  descriptionMaxWidth
} from "@responsible-ai/core-ui";
import { localization } from "@responsible-ai/localization";
import {
  Stack,
  Text,
  ComboBox,
  IComboBox,
  IComboBoxOption
} from "office-ui-fabric-react";
import React from "react";

import { DatasetCohortStatsTable } from "./DatasetCohortStatsTable";
import { DisaggregatedAnalysisTable } from "./DisaggregatedAnalysisTable";
import { generateOverlappingFeatureBasedCohorts } from "./DisaggregatedAnalysisUtils";
import { modelOverviewStyles } from "./ModelOverview.styles";
import { getSelectableMetrics } from "./StatsTableUtils";

interface IModelOverviewProps {
  showNewModelOverviewExperience: boolean;
}

interface IModelOverviewState {
  selectedMetrics: string[];
  selectedFeatures: number[];
}

export class ModelOverview extends React.Component<
  IModelOverviewProps,
  IModelOverviewState
> {
  public static contextType = ModelAssessmentContext;
  public context: React.ContextType<typeof ModelAssessmentContext> =
    defaultModelAssessmentContext;
  private featureComboBoxRef = React.createRef<IComboBox>();

  constructor(props: IModelOverviewProps) {
    super(props);
    this.state = {
      selectedFeatures: [],
      selectedMetrics: []
    };
  }

  public componentDidMount(): void {
    let defaultSelectedMetrics: string[] = [];
    if (this.context.dataset.task_type === classificationTask) {
      defaultSelectedMetrics = [
        BinaryClassificationMetrics.Accuracy,
        BinaryClassificationMetrics.FalsePositiveRate,
        BinaryClassificationMetrics.FalseNegativeRate,
        BinaryClassificationMetrics.SelectionRate
      ];
    } else {
      // task_type === "regression"
      defaultSelectedMetrics = [
        RegressionMetrics.MeanAbsoluteError,
        RegressionMetrics.MeanSquaredError,
        RegressionMetrics.MeanPrediction
      ];
    }
    this.setState({
      selectedMetrics: defaultSelectedMetrics
    });
  }

  public render(): React.ReactNode {
    if (this.context.dataset.predicted_y === undefined) {
      return (
        <MissingParametersPlaceholder>
          {localization.Interpret.ModelPerformance.missingParameters}
        </MissingParametersPlaceholder>
      );
    }

    const classNames = modelOverviewStyles();

    const selectableMetrics = getSelectableMetrics(
      this.context.dataset.task_type
    );

    const columns: string[] = [
      localization.ModelAssessment.ModelOverview.countColumnHeader
    ];
    columns.push(
      ...selectableMetrics
        .filter((element) =>
          this.state.selectedMetrics.includes(element.key.toString())
        )
        .map((element) => {
          return element.text;
        })
    );

    // generate table contents for selected feature cohorts
    const featureBasedCohorts = generateOverlappingFeatureBasedCohorts(
      this.context.jointDataset,
      this.context.dataset,
      this.state.selectedFeatures
    );

    const featureSelectionLimitReached =
      this.state.selectedFeatures.length >= 2;
    const featureSelectionOptions: IComboBoxOption[] =
      this.context.dataset.feature_names.map((featureName, index) => {
        return {
          disabled:
            featureSelectionLimitReached &&
            !this.state.selectedFeatures.includes(index),
          key: index,
          text: featureName
        };
      });

    return (
      <Stack
        className={classNames.sectionStack}
        tokens={{ childrenGap: "10px" }}
      >
        <Text variant="medium" style={{ maxWidth: descriptionMaxWidth }}>
          {localization.Interpret.ModelPerformance.helperText}
        </Text>
        {!this.props.showNewModelOverviewExperience && <OverallMetricChart />}
        {this.props.showNewModelOverviewExperience && (
          <>
            <Stack horizontal tokens={{ childrenGap: "20px" }}>
              <ComboBox
                placeholder={
                  localization.ModelAssessment.ModelOverview
                    .metricSelectionDropdownPlaceholder
                }
                label={
                  localization.ModelAssessment.ModelOverview.metricsDropdown
                }
                selectedKey={this.state.selectedMetrics}
                options={selectableMetrics}
                onChange={this.onMetricSelectionChange}
                multiSelect
                className={classNames.dropdown}
                styles={FabricStyles.limitedSizeMenuDropdown}
              />
              <ComboBox
                componentRef={this.featureComboBoxRef}
                placeholder={
                  localization.ModelAssessment.ModelOverview
                    .featureSelectionDropdownPlaceholder
                }
                label={
                  localization.ModelAssessment.ModelOverview.featuresDropdown
                }
                selectedKey={this.state.selectedFeatures}
                options={featureSelectionOptions}
                onChange={this.onFeatureSelectionChange}
                multiSelect
                className={classNames.dropdown}
                styles={FabricStyles.limitedSizeMenuDropdown}
              />
            </Stack>
            <DatasetCohortStatsTable
              selectableMetrics={selectableMetrics}
              selectedMetrics={this.state.selectedMetrics}
            />
            <DisaggregatedAnalysisTable
              selectableMetrics={selectableMetrics}
              selectedMetrics={this.state.selectedMetrics}
              selectedFeatures={this.state.selectedFeatures}
              featureBasedCohorts={featureBasedCohorts}
              featureComboBoxRef={this.featureComboBoxRef}
            />
          </>
        )}
      </Stack>
    );
  }

  private onMetricSelectionChange = (
    _: React.FormEvent<IComboBox>,
    item?: IComboBoxOption
  ): void => {
    if (item && item.selected !== undefined) {
      const metric = item.key.toString();
      if (item.selected && !this.state.selectedMetrics.includes(metric)) {
        this.setState({
          selectedMetrics: this.state.selectedMetrics.concat([metric])
        });
      }
      if (!item.selected && this.state.selectedMetrics.includes(metric)) {
        const selectedMetrics = this.state.selectedMetrics;
        const unselectedMetricIndex = selectedMetrics.findIndex(
          (key) => key === metric
        );
        // remove unselected metric
        selectedMetrics.splice(unselectedMetricIndex, 1);
        this.setState({
          selectedMetrics
        });
      }
    }
  };

  private onFeatureSelectionChange = (
    _: React.FormEvent<IComboBox>,
    item?: IComboBoxOption
  ): void => {
    if (item && item.selected !== undefined && typeof item.key === "number") {
      // technically we know it's only numbers but item.key has type string | number
      if (item.selected && !this.state.selectedFeatures.includes(item.key)) {
        this.setState({
          selectedFeatures: this.state.selectedFeatures.concat([
            item.key as number
          ])
        });
      }
      if (!item.selected && this.state.selectedFeatures.includes(item.key)) {
        const selectedFeatures = this.state.selectedFeatures;
        const unselectedFeatureIndex = selectedFeatures.findIndex(
          (key) => key === item.key
        );
        // remove unselected metric
        selectedFeatures.splice(unselectedFeatureIndex, 1);
        this.setState({
          selectedFeatures
        });
      }
    }
  };
}