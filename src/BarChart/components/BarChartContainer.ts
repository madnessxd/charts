import { Component, createElement } from "react";

import { Alert } from "../../components/Alert";
import { BarChart } from "./BarChart";
import { ChartLoading } from "../../components/ChartLoading";
import {
    DataSourceProps, DynamicDataSourceProps, MxObject, OnClickProps, fetchDataFromSeries, fetchSeriesData, handleOnClick
} from "../../utils/data";
import { Dimensions, parseStyle } from "../../utils/style";
import { WrapperProps } from "../../utils/types";

import { BarMode, ScatterData } from "plotly.js";

export interface BarChartContainerProps extends WrapperProps, Dimensions, DynamicDataSourceProps, OnClickProps {
    barMode: BarMode;
    responsive: boolean;
    title?: string;
    showGrid: boolean;
    showToolbar: boolean;
    showLegend: boolean;
    tooltipForm: string;
    staticSeries: StaticSeriesProps[];
}

interface BarChartContainerState {
    alertMessage?: string;
    data?: ScatterData[];
    loadingStatic?: boolean;
    loadingDynamic?: boolean;
}

interface StaticSeriesProps extends DataSourceProps {
    name: string;
}

export default class BarChartContainer extends Component<BarChartContainerProps, BarChartContainerState> {
    private subscriptionHandle: number;
    private data: ScatterData[] = [];
    private activeStaticIndex = 0;

    constructor(props: BarChartContainerProps) {
        super(props);

        this.state = {
            alertMessage: BarChartContainer.validateProps(this.props),
            loadingStatic: true,
            loadingDynamic: true,
            data: []
        };
        this.fetchData = this.fetchData.bind(this);
        this.handleFetchedSeries = this.handleFetchedSeries.bind(this);
        this.processDynamicSeriesData = this.processDynamicSeriesData.bind(this);
        this.processStaticSeriesData = this.processStaticSeriesData.bind(this);
        this.handleOnClick = this.handleOnClick.bind(this);
        this.openTooltipForm = this.openTooltipForm.bind(this);
    }

    render() {
        if (this.state.alertMessage) {
            return createElement(Alert, {
                bootstrapStyle: "danger",
                className: "widget-charts-bar-alert",
                message: this.state.alertMessage
            });
        }

        if (this.state.loadingDynamic || this.state.loadingStatic) {
            return createElement(ChartLoading, { text: "Loading" });
        }

        return createElement(BarChart, {
            className: this.props.class,
            config: { displayModeBar: this.props.showToolbar, doubleClick: false },
            height: this.props.height,
            heightUnit: this.props.heightUnit,
            layout: {
                autosize: this.props.responsive,
                barmode: this.props.barMode,
                xaxis: { showgrid: this.props.showGrid, title: this.props.xAxisLabel },
                yaxis: { showgrid: this.props.showGrid, title: this.props.yAxisLabel },
                showlegend: this.props.showLegend,
                hovermode: this.props.tooltipForm ? "closest" : undefined
            },
            style: parseStyle(this.props.style),
            width: this.props.width,
            widthUnit: this.props.widthUnit,
            data: this.state.data,
            onClick: this.handleOnClick,
            onHover: this.props.tooltipForm ? this.openTooltipForm : undefined
        });
    }

    componentWillReceiveProps(newProps: BarChartContainerProps) {
        this.resetSubscriptions(newProps.mxObject);
        this.fetchData(newProps.mxObject);
    }

    componentWillUnmount() {
        if (this.subscriptionHandle) {
            window.mx.data.unsubscribe(this.subscriptionHandle);
        }
    }

    private handleOnClick() {
        handleOnClick(this.props, this.props.mxObject);
    }

    private openTooltipForm(domNode: HTMLDivElement, dataObject: mendix.lib.MxObject) {
        const context = new mendix.lib.MxContext();
        context.setContext(dataObject.getEntity(), dataObject.getGuid());
        window.mx.ui.openForm(this.props.tooltipForm, { domNode, context });
    }

    public static validateProps(props: BarChartContainerProps): string {
        return props.dataSourceType === "microflow" && !props.dataSourceMicroflow
            ? `Configuration error in bar chart: 'Data source type' is set to 'Microflow' but the microflow is missing`
            : "";
    }

    private resetSubscriptions(mxObject?: mendix.lib.MxObject) {
        this.componentWillUnmount();

        if (mxObject) {
            this.subscriptionHandle = window.mx.data.subscribe({
                callback: () => this.fetchData(mxObject),
                guid: mxObject.getGuid()
            });
        }
    }

    private fetchData(mxObject?: mendix.lib.MxObject) {
        this.data = [];
        if (!this.state.loadingDynamic || this.state.loadingStatic) {
            this.setState({ loadingStatic: true, loadingDynamic: true });
        }
        if (mxObject) {
            if (this.props.staticSeries.length > 0) {
                this.props.staticSeries.forEach(staticSeries =>
                    fetchSeriesData(mxObject, staticSeries.dataEntity, staticSeries, this.processStaticSeriesData)
                );
            } else {
                this.setState({ loadingStatic: false });
            }
            fetchSeriesData(mxObject, this.props.seriesEntity, this.props, this.handleFetchedSeries);
        } else {
            this.setState({ loadingStatic: false, loadingDynamic: false, data: [] });
        }
    }

    private processStaticSeriesData(data: MxObject[], errorMessage?: string) {
        const activeSeries = this.props.staticSeries[this.activeStaticIndex];
        const isFinal = this.props.staticSeries.length === this.activeStaticIndex + 1;
        this.activeStaticIndex = isFinal ? 0 : this.activeStaticIndex + 1;
        if (errorMessage) {
            this.handleFetchDataError(errorMessage);

            return;
        }
        this.processSeriesData(activeSeries.name, data, activeSeries, isFinal);
        if (isFinal) {
            this.setState({ loadingStatic: false });
        }
    }

    private handleFetchedSeries(allSeries?: MxObject[], errorMessage?: string) {
        if (errorMessage) {
            this.handleFetchDataError(errorMessage);

            return;
        }

        if (allSeries && allSeries.length) {
            fetchDataFromSeries(allSeries, this.props.dataEntity, this.props.xAxisSortAttribute, this.processDynamicSeriesData); // tslint:disable-line
        } else {
            this.setState({ loadingDynamic: false });
        }
    }

    private processDynamicSeriesData(singleSeries: MxObject, data: MxObject[], isFinal = false, error?: Error) {
        if (error) {
            this.handleFetchDataError(`An error occurred while retrieving dynamic chart data: ${error.message}`);

            return;
        }
        const seriesName = singleSeries.get(this.props.seriesNameAttribute) as string;
        this.processSeriesData(seriesName, data, this.props, isFinal);
        if (isFinal) {
            this.setState({ loadingDynamic: false });
        }
    }

    private processSeriesData<T extends DataSourceProps>(seriesName: string, data: MxObject[], dataOptions: T, isFinal = false) { // tslint:disable-line max-line-length
        const fetchedData = data.map(value => ({
            x: value.get(dataOptions.xValueAttribute) as Plotly.Datum,
            y: parseInt(value.get(dataOptions.yValueAttribute) as string, 10) as Plotly.Datum
        }));

        const barData = {
            name: seriesName,
            type: "bar",
            hoverinfo: this.props.tooltipForm ? "text" : "all",
            x: fetchedData.map(value => value.x),
            y: fetchedData.map(value => value.y),
            mxObjects: data
        } as ScatterData;

        this.data.push(barData);
        if (isFinal) {
            this.setState({ data: this.data });
        }
    }

    private handleFetchDataError(errorMessage: string) {
        window.mx.ui.error(errorMessage);
        this.setState({ data: [], loadingStatic: false, loadingDynamic: false });
    }
}
