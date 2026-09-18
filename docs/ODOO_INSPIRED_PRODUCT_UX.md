# AM Business Platform — Odoo-Inspired Product UX & Operating Model

## Purpose

Use Odoo 19 as the primary external reference for ERP interaction patterns, information architecture, record-centric workflows, navigation, views, search/filter/grouping, dashboards, smart actions, and cross-module continuity.

This is a **behavioral and UX benchmark**, not a request to copy Odoo source code, branding, exact pixels, or proprietary assets.

## Current AM state observed

AM already has:
- a master shell with Navbar + Sidebar
- global Ctrl/Cmd+K search
- tenant/company context in the shell
- RTL/LTR and dark/light support
- broad modules: Accounting, Inventory, Sales, Purchasing, CRM, HR/Payroll, POS, Manufacturing, Treasury, Assets, Projects, Reports, AI, onboarding, branding
- domain engines and a shared accounting/persistence/security core
- module-specific workspaces and dashboards

The current product is not yet at Odoo-level UX depth or record-centric consistency across all modules.

## Target operating model

### 1. One Core, many Apps

Keep the single shared AM core:
- identity and scope
- permissions / SoD
- company / branch / warehouse context
- master-data records
- workflow/state machine
- persistence
- fiscal period
- audit
- canonical financial event → GL
- shared search/filter/sort/group primitives

Each application module should extend these shared contracts rather than invent its own behavior.

### 2. Record-centric ERP

Every major business object should have a canonical record screen with:
- stable business number
- status / state bar
- primary action
- secondary actions
- smart counters/buttons for related records
- structured form sections/tabs
- attachments
- activity/follow-up
- audit/history
- source / destination links
- related accounting and inventory documents where applicable
- clear read-only vs editable states

Target objects include:
Customer, Supplier, Product, Sales Order, Delivery, Customer Invoice, Customer Payment, Purchase Request, RFQ, Purchase Order, Receipt/GRN, Vendor Bill, Supplier Payment, Stock Transfer, Inventory Adjustment, BOM, Manufacturing Order, Work Order, Employee, Payroll Run, Asset, Bank Transaction, Reconciliation Item, Journal Entry, Project, CRM Lead/Opportunity.

### 3. Standard view system

Create reusable AM view primitives inspired by Odoo:
- List
- Form
- Kanban
- Search/Filter
- Group By
- Pivot
- Graph
- Calendar where relevant
- Timeline/Gantt where justified
- Activity view where relevant

A module should not invent a separate table/search/filter UX unless there is a documented domain reason.

### 4. Search / Filter / Group By

Every substantial list/report should expose:
- fast free-text search
- filters
- date/period
- company/branch/warehouse scope where applicable
- status
- responsible user
- saved favorites/views where useful
- Group By
- clear active-filter chips
- reset/clear
- result count
- server-backed pagination where scale requires it

The filter contract must operate on authorized records only.

### 5. Dashboards

Dashboards must answer business questions, not just display cards.

Each dashboard should combine:
- actionable KPI cards
- work queues / overdue items
- charts
- recent activity
- quick actions
- drill-down links to the underlying records
- global filters where relevant
- role-aware content

A KPI must be traceable to the canonical source and the same period/scope used by reports.

### 6. Workflow-first UX

Use visible state progression:
Draft → Pending Approval → Approved → Confirmed/Posted → Paid/Done/Closed, according to the domain.

Users should always see:
- current state
- allowed next action
- who can perform it
- why an action is disabled/rejected
- resulting downstream documents

Examples:
Sales Order → Delivery → Invoice → Payment → Reconciliation
Purchase Order → Receipt → Vendor Bill → Payment → Reconciliation
BOM → Manufacturing Order → Work Orders → Production → Inventory/WIP → GL
Payroll Draft → Approval → Post → Pay → GL/Reconciliation

### 7. Smart related navigation

From a record, users should reach related records without leaving the business context:
- Sales Order: deliveries, invoices, payments, journal entry
- Purchase Order: receipts, vendor bills, payments
- Product: stock, forecast, purchases, sales, BOMs, used-in
- Manufacturing Order: BOM, components, work orders, material issues, production receipts, costs, journal/source event
- Customer/Supplier: invoices, payments, open items, statement, journal items

### 8. Visual language

Build a coherent AM design system:
- one spacing scale
- typography hierarchy
- predictable card/table/form primitives
- primary vs secondary action hierarchy
- semantic states: draft, warning, success, error, blocked, info
- compact enterprise density without visual clutter
- accessible focus/keyboard states
- mobile-first responsive behavior
- Arabic RTL parity, not a translated-afterthought layout

Use AM branding; use Odoo only as interaction/information-architecture reference.

### 9. No false affordances

Never render a button that looks operational unless it has a real workflow behind it.

If a feature is unavailable, show a truthful disabled/configuration state instead of a decorative action.

### 10. Reports

Reports need:
- report-specific scope/period controls
- list/detail/drill-down
- graph/pivot where analytical
- export
- source traceability
- reconciliation status where relevant
- consistent empty/loading/error states

Avoid generic object-dump rendering for production reports.

## Explicit current gaps to investigate

The current repository contains UI patterns that should be audited for product maturity, including:
- Report Center has a Tax tab that currently states a standalone tax report route is not available.
- Report loading code contains a fallback company identifier in the UI layer.
- Several module views are dashboard/workspace compositions rather than standardized record/list/form systems.
- Some action controls need verification that the visible button is wired to a real backend workflow rather than acting as visual scaffolding.
- Common search/filter/group/paging behavior is not yet clearly uniform across all modules.
- Cross-module smart navigation is not consistently exposed across all records.
- Chatter/activity/attachments/history patterns are not yet a universal record contract.

These observations are hypotheses to verify in code, not reasons to weaken or bypass existing functionality.

## Priority

Do not interrupt P0/P1 accounting/security closure for cosmetic work.

After the production-correctness gates are closed:
1. build the shared AM view/design primitives;
2. standardize record/list/form/search patterns;
3. migrate high-value modules first: Sales, Purchasing, Inventory, Accounting, Manufacturing, HR/Payroll, Treasury;
4. add cross-module smart navigation;
5. rebuild dashboards around drill-down and traceable KPIs;
6. complete Arabic RTL/LTR and responsive acceptance;
7. run a dedicated product UX acceptance pass.

## Acceptance

The UX track is complete only when a user can learn one module's List/Form/Search/Filter/Group workflow and apply it consistently to the other major modules, while every visible action is backed by a real authorized workflow and every key number can be drilled to its persisted source.
