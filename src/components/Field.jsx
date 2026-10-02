// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Labelled form field wrapper.
 *
 * @param {string}      label    - Uppercase field label displayed above the input.
 * @param {React.Node}  children - The input or textarea element to render inside.
 * @param {string}      [hint]   - Optional secondary hint text shown beside the label.
 * @param {React.Node}  [action] - Optional action (e.g. a button) pinned to the
 *   right end of the label row, for a shortcut related to this field.
 */
export default function Field({ label, children, hint, action }) {
  return (
    <div>
      <div className="field-label-row">
        <label className="field-label">{label}</label>
        {hint && <span className="field-hint">{hint}</span>}
        {action && <span className="field-action">{action}</span>}
      </div>
      {children}
    </div>
  );
}
