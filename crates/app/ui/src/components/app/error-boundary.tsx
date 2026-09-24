import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorPanel } from "@/components/app/error-panel";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches a render error in one screen so the sidebar and header keep working. Retry unmounts and remounts the screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4">
          <ErrorPanel error={this.state.error} onRetry={() => this.setState({ error: null })} title="This screen stopped working" />
        </div>
      );
    }
    return this.props.children;
  }
}
