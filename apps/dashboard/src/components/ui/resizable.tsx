"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

type PrimitiveProps = React.HTMLAttributes<HTMLDivElement> &
  Record<string, unknown>;
type Direction = "horizontal" | "vertical";

type PrimitiveModule = {
  Group?: React.ComponentType<PrimitiveProps>;
  PanelGroup?: React.ComponentType<PrimitiveProps>;
  Panel: React.ComponentType<PrimitiveProps>;
  Separator?: React.ComponentType<PrimitiveProps>;
  PanelResizeHandle?: React.ComponentType<PrimitiveProps>;
};

const primitives = ResizablePrimitive as unknown as PrimitiveModule;
const usesModernApi = Boolean(primitives.Group && primitives.Separator);
const panelGroupPrimitive = usesModernApi
  ? primitives.Group
  : primitives.PanelGroup;
const resizeHandlePrimitive = usesModernApi
  ? primitives.Separator
  : primitives.PanelResizeHandle;

if (!panelGroupPrimitive || !resizeHandlePrimitive) {
  throw new Error("Unsupported react-resizable-panels API");
}

const ResizablePanelGroup = ({
  className,
  direction = "horizontal",
  ...props
}: PrimitiveProps & { direction?: Direction }) =>
  React.createElement(panelGroupPrimitive, {
    ...props,
    ...(usesModernApi ? { orientation: direction } : { direction }),
    className: cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className,
    ),
  });

const ResizablePanel = primitives.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: PrimitiveProps & { withHandle?: boolean }) =>
  React.createElement(
    resizeHandlePrimitive,
    {
      ...props,
      className: cn(
        "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className,
      ),
    },
    withHandle &&
      React.createElement(
        "div",
        {
          className:
            "z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border",
        },
        React.createElement(GripVertical, { className: "h-2.5 w-2.5" }),
      ),
  );

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
