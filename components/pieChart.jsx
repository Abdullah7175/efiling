"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { Pie, PieChart } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export const description = "A pie chart showing work requests by district";

const chartConfig = {
  count: {
    label: "Requests",
  },
};

export function PieChartWithValues() {
  const [chartData, setChartData] = React.useState([]);
  const [trend, setTrend] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchChartData = async () => {
      try {
        const response = await fetch('/api/dashboard/charts');
        if (response.ok) {
          const data = await response.json();
          // Use district data instead of status data
          const districtData = data.pieChart.districts.map((item, index) => ({
            ...item,
            fill: `hsl(var(--chart-${index + 1}))`
          }));
          setChartData(districtData);
          setTrend(data.trend);
        }
      } catch (error) {
        console.error('Error fetching chart data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchChartData();
  }, []);

  if (loading) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="items-center pb-0">
          <CardTitle>Requests by District</CardTitle>
          <CardDescription>Loading chart data...</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pb-0 flex items-center justify-center h-[250px]">
          <div className="text-lg">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Requests by District</CardTitle>
        <CardDescription>Geographic distribution of work requests</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="district"
              stroke="0"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm mt-6">
        <div className="flex items-center gap-2 font-medium leading-none">
          {trend > 0 ? 'Trending up' : trend < 0 ? 'Trending down' : 'No change'} by {Math.abs(trend)}% this month 
          {trend > 0 && <TrendingUp className="h-4 w-4" />}
          {trend < 0 && <TrendingUp className="h-4 w-4 rotate-180" />}
        </div>
        <div className="leading-none text-muted-foreground">
          Showing geographic distribution of work requests
        </div>
      </CardFooter>
    </Card>
  );
}
