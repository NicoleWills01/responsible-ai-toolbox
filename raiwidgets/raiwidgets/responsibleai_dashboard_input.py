# Copyright (c) Microsoft Corporation
# Licensed under the MIT License.

import traceback
from typing import List, Optional, Union

import numpy as np
import pandas as pd

from erroranalysis._internal.constants import ModelTask, display_name_to_metric
from raiutils.data_processing import convert_to_list, serialize_json_safe
from raiutils.models import is_classifier
from raiwidgets.cohort import Cohort
from raiwidgets.constants import ErrorMessages
from raiwidgets.error_handling import _format_exception
from raiwidgets.interfaces import WidgetRequestResponseConstants
from responsibleai import RAIInsights, RAIForecastingInsights
from responsibleai._internal.constants import ManagerNames
from responsibleai.exceptions import UserConfigValidationException

EXP_VIZ_ERR_MSG = ErrorMessages.EXP_VIZ_ERR_MSG


class ResponsibleAIDashboardInput:
    def __init__(
            self,
            analysis: Union[RAIInsights, RAIForecastingInsights],
            cohort_list: Optional[List[Cohort]] = None):
        """Initialize the Explanation Dashboard Input.

        :param analysis:
            A RAIInsights object that represents an explanation.
        :type analysis: Union[RAIInsights, RAIForecastingInsights]
        :param cohort_list:
            List of cohorts defined by the user for the dashboard.
        :type cohort_list: List[Cohort]
        """
        self._analysis = analysis
        model = analysis.model
        self._is_classifier = is_classifier(model)
        self.dashboard_input = analysis.get_data()

        self._validate_cohort_list(cohort_list)

        self._feature_length = len(self.dashboard_input.dataset.feature_names)
        if hasattr(analysis, ManagerNames.ERROR_ANALYSIS):
            self._error_analyzer = analysis.error_analysis._analyzer

    def _validate_cohort_list(self, cohort_list=None):
        if isinstance(self._analysis, RAIInsights) and cohort_list is None:
            self.dashboard_input.cohortData = []
            return

        if isinstance(self._analysis, RAIForecastingInsights):
            # Ensure user did not pass cohort_list and use the generated time series.
            if cohort_list is not None:
                raise UserConfigValidationException(
                    "cohort_list is not supported for forecasting analysis.")
            # use generated time series
            cohort_list = self._analysis._time_series

        if not isinstance(cohort_list, list):
            raise UserConfigValidationException(
                "cohort_list parameter should be a list.")

        if not all(isinstance(entry, Cohort) for entry in cohort_list):
            raise UserConfigValidationException(
                "All entries in cohort_list should be of type Cohort.")

        all_cohort_names = [cohort.name for cohort in cohort_list]
        unique_cohort_names = np.unique(all_cohort_names).tolist()

        if len(unique_cohort_names) != len(all_cohort_names):
            raise UserConfigValidationException(
                "Found cohorts with duplicate names. "
                "All pre-defined cohorts need to have distinct names.")

        test_data = pd.DataFrame(
            data=self.dashboard_input.dataset.features,
            columns=self.dashboard_input.dataset.feature_names)
        if self.dashboard_input.dataset.task_type == \
                ModelTask.CLASSIFICATION:
            class_names_list = self.dashboard_input.dataset.class_names
            true_y_array = self.dashboard_input.dataset.true_y
            true_class_array = np.array(
                [class_names_list[index] for index in true_y_array])
            test_data[self.dashboard_input.dataset.target_column] = \
                true_class_array
        else:
            test_data[self.dashboard_input.dataset.target_column] = \
                self.dashboard_input.dataset.true_y

        categorical_features = \
            self.dashboard_input.dataset.categorical_features
        for cohort in cohort_list:
            cohort._validate_with_test_data(
                test_data=test_data,
                target_column=self.dashboard_input.dataset.target_column,
                categorical_features=categorical_features,
                is_classification=self._is_classifier)

        self.dashboard_input.cohortData = cohort_list

    def on_predict(self, data):
        try:
            data = pd.DataFrame(
                data, columns=self.dashboard_input.dataset.feature_names)
            data = self._analysis.get_test_data(test_data=data)
            if (self._is_classifier):
                prediction = convert_to_list(
                    self._analysis.model.predict_proba(data), EXP_VIZ_ERR_MSG)
            else:
                prediction = convert_to_list(
                    self._analysis.model.predict(data), EXP_VIZ_ERR_MSG)
            return {
                WidgetRequestResponseConstants.data: prediction
            }
        except Exception as e:
            print(e)
            traceback.print_exc()
            e_str = _format_exception(e)
            return {
                WidgetRequestResponseConstants.error: "Model threw exception"
                " while predicting..."
                "inner error: {}".format(e_str),
                WidgetRequestResponseConstants.data: []
            }

    def _prepare_filtered_error_analysis_data(self, features, filters,
                                              composite_filters, metric):
        filtered_data_df = self._analysis.get_filtered_test_data(
            filters=filters,
            composite_filters=composite_filters,
            include_original_columns_only=False)

        msg = "Feature {} not found in dataset. Existing features: {}"
        for feature in features:
            if feature is None:
                continue
            if feature not in filtered_data_df.columns:
                raise UserConfigValidationException(
                    msg.format(feature, filtered_data_df.columns))

        self._error_analyzer.update_metric(metric)
        return filtered_data_df

    def debug_ml(self, data):
        try:
            features = data[0]
            filters = data[1]
            composite_filters = data[2]
            max_depth = data[3]
            num_leaves = data[4]
            min_child_samples = data[5]
            metric = display_name_to_metric[data[6]]

            filtered_data_df = self._prepare_filtered_error_analysis_data(
                features, filters, composite_filters, metric)

            tree = self._error_analyzer.compute_error_tree_on_dataset(
                features, filtered_data_df,
                max_depth, num_leaves, min_child_samples)
            return {
                WidgetRequestResponseConstants.data: tree
            }
        except Exception as e:
            print(e)
            traceback.print_exc()
            e_str = _format_exception(e)
            return {
                WidgetRequestResponseConstants.error:
                    "Failed to generate json tree representation,"
                    "inner error: {}".format(e_str),
                WidgetRequestResponseConstants.data: []
            }

    def matrix(self, data):
        try:
            features = data[0]
            if features[0] is None and features[1] is None:
                return {WidgetRequestResponseConstants.data: []}
            filters = data[1]
            composite_filters = data[2]
            quantile_binning = data[3]
            num_bins = data[4]
            metric = display_name_to_metric[data[5]]

            filtered_data_df = self._prepare_filtered_error_analysis_data(
                features, filters, composite_filters, metric)

            matrix = self._error_analyzer.compute_matrix_on_dataset(
                features, filtered_data_df,
                quantile_binning, num_bins)
            return {
                WidgetRequestResponseConstants.data: matrix
            }
        except Exception as e:
            print(e)
            traceback.print_exc()
            e_str = _format_exception(e)
            return {
                WidgetRequestResponseConstants.error:
                    "Failed to generate json matrix representation,"
                    "inner error: {}".format(e_str),
                WidgetRequestResponseConstants.data: []
            }

    def importances(self):
        try:
            scores = self._error_analyzer.compute_importances()
            return {
                WidgetRequestResponseConstants.data: scores
            }
        except Exception as e:
            print(e)
            traceback.print_exc()
            e_str = _format_exception(e)
            return {
                WidgetRequestResponseConstants.error:
                    "Failed to generate feature importances,"
                    "inner error: {}".format(e_str),
                WidgetRequestResponseConstants.data: []
            }

    def causal_whatif(self, post_data):
        try:
            id, features, feature_name, new_value, target = post_data
            whatif = self._analysis.causal._whatif(
                id, self._analysis.get_test_data(
                    test_data=pd.DataFrame.from_records(features)), new_value,
                feature_name, target)
            return {
                WidgetRequestResponseConstants.data: whatif
            }
        except Exception as e:
            print(e)
            traceback.print_exc()
            e_str = _format_exception(e)
            return {
                WidgetRequestResponseConstants.error:
                    "Failed to generate causal what-if,"
                    "inner error: {}".format(e_str),
                WidgetRequestResponseConstants.data: []
            }

    def get_exp(self, index):
        try:
            exp = self._analysis.explainer.compute_single_explanation(index)
            return {
                WidgetRequestResponseConstants.data: exp
            }
        except Exception as e:
            print(e)
            traceback.print_exc()
            e_str = _format_exception(e)
            return {
                WidgetRequestResponseConstants.error:
                    "Failed to generate image explanation,"
                    "inner error: {}".format(e_str),
                WidgetRequestResponseConstants.data: []
            }

    def get_global_causal_effects(self, post_data):
        try:
            id = post_data[0]
            filters = post_data[1]
            composite_filters = post_data[2]
            filtered_data_df = self._analysis.get_filtered_test_data(
                filters=filters,
                composite_filters=composite_filters,
                include_original_columns_only=True)

            global_effects = \
                serialize_json_safe(
                    self._analysis.causal.request_global_cohort_effects(
                        id, filtered_data_df))
            return {
                WidgetRequestResponseConstants.data: global_effects
            }
        except Exception as e:
            print(e)
            traceback.print_exc()
            e_str = _format_exception(e)
            return {
                WidgetRequestResponseConstants.error:
                    "Failed to generate global causal effects for cohort,"
                    "inner error: {}".format(e_str),
                WidgetRequestResponseConstants.data: []
            }

    def get_global_causal_policy(self, post_data):
        try:
            id = post_data[0]
            filters = post_data[1]
            composite_filters = post_data[2]
            filtered_data_df = self._analysis.get_filtered_test_data(
                filters=filters,
                composite_filters=composite_filters,
                include_original_columns_only=True)

            global_policy = \
                serialize_json_safe(
                    self._analysis.causal.request_global_cohort_policy(
                        id, filtered_data_df))
            return {
                WidgetRequestResponseConstants.data: global_policy
            }
        except Exception as e:
            print(e)
            traceback.print_exc()
            e_str = _format_exception(e)
            return {
                WidgetRequestResponseConstants.error:
                    "Failed to generate global causal policy for cohort,"
                    "inner error: {}".format(e_str),
                WidgetRequestResponseConstants.data: []
            }

    def forecast(self, post_data):
        # This is a separate function from predict since we apply
        # transformations to an entire time series. That enables us
        # to only send the transformation information from UI to backend
        # rather than having to send the entire time series across.
        try:
            filters = post_data[0]
            composite_filters = post_data[1]
            transformation = post_data[2]
            filtered_data_df = self._analysis.get_filtered_test_data(
                filters=filters,
                composite_filters=composite_filters,
                include_original_columns_only=True)

            transformation_func = None
            # transforming with pandas
            if len(transformation) > 0:
                op, feature, value = transformation
                if op == "add":
                    transformation_func = lambda x: x + float(value)
                elif op == "subtract":
                    transformation_func = lambda x: x - float(value)
                elif op == "multiply":
                    transformation_func = lambda x: x * float(value)
                elif op == "divide":
                    transformation_func = lambda x: x / float(value)
                elif op == "change":
                    transformation_func = lambda x: value
                else:
                    raise ValueError(f"An invalid transformation operation {op} was provided.")

                filtered_data_df[feature] = filtered_data_df[feature].map(transformation_func)

            prediction = convert_to_list(self._analysis.model.forecast(filtered_data_df), EXP_VIZ_ERR_MSG)
            return {
                WidgetRequestResponseConstants.data: prediction
            }
        except Exception as e:
            print(e)
            traceback.print_exc()
            e_str = _format_exception(e)
            return {
                WidgetRequestResponseConstants.error:
                    "Failed to generate forecast for time series, "
                    "inner error: {}".format(e_str),
                WidgetRequestResponseConstants.data: []
            }
