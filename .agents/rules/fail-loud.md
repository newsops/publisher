# Fail loud

Build, test, lint, typecheck, and harness checks must fail with a non-zero exit code when they cannot establish their contract. Do not catch an error just to render an empty state or return success. A known empty content set is a domain state; an unreadable content source is a build failure.
