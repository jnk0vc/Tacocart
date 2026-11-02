import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "tacocart-concierge": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { recipe?: string },
        HTMLElement
      >;
    }
  }
}
