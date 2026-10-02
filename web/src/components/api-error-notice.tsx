import { errorMessage } from "@/lib/api";
import { Button, Container, Notice, cn } from "./ui";

/** Error state for a page whose data failed to load. Pass `onRetry` (e.g. `reload` from useApi) to show a retry button. */
export function ApiErrorNotice({
  error,
  onRetry,
  title = "We couldn't load this page",
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <Container className={cn("py-16 sm:py-24", className)}>
      <div className="mx-auto max-w-xl">
        <Notice tone="error" title={title}>
          {errorMessage(error)}
        </Notice>
        {onRetry && (
          <Button variant="outline" className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </Container>
  );
}
