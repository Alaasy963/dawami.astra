import { Component, type ReactNode } from "react";
import { t } from "./i18n";

export default class MapBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <p role="alert">
          {t(
            "تعذر تحميل الخريطة. بيانات النموذج محفوظة على الشاشة؛ حدّث التطبيق عند توفر الإنترنت ثم أعد المحاولة.",
          )}
        </p>
      );
    return this.props.children;
  }
}
