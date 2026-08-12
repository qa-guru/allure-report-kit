import type { UIChartData } from "@allurereport/web-commons";
import type { AllureChartData } from "@qa-guru/allure-report-kit/allure";

/** Allure store payload — same JSON the kit adapter already reads structurally. */
export function chartDataForKit(data: UIChartData): AllureChartData {
  return data as AllureChartData;
}
