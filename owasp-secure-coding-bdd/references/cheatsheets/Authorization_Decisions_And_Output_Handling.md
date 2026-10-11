# Authorization Decisions and Output Handling

## What it is

Once a Policy Decision Point (PDP) has decided, the Policy Enforcement Point (PEP) has to apply the
full meaning of that decision before it releases any data or performs the action. This covers a single
check, a batch of checks, a list of resources the subject may reach, and a query filter the data
layer runs. This is the per-sheet guidance from the OWASP Authorization Decisions and Output Handling
Cheat Sheet, condensed to the controls that hold and the attack they stop.

## The attack it stops

The attack is a data leak or an unauthorized action through an output path that skips enforcement.
Concrete cases from the source: a batch of checks where one item's permit is wrongly applied to every
item, so denied records come back too; a count, export, or search that reveals protected rows the
caller cannot read; a filter that silently drops a clause it could not translate and so returns
everything; and an empty or truncated "allowed" list read as "no restriction," which hands back all
records. In each case the decision was correct but the output stage failed to honor it.

## Controls

The cheat sheet's controls, grouped as it groups them:

1. **Bind each decision to its full context.** Tie every decision to the authenticated subject, the
   action, the resource, the tenant, and any relevant context, and carry that information on the
   evaluation call. Passing verified role or relationship attributes is fine when the policy needs
   them, but accepting a client's own claim about its privileges is not.
2. **Handle batches item by item.** A batch simply groups separate checks. Match each response to its
   request using the ordering or identifiers the API defines, and deny any item whose result is
   missing, invalid, or an error. Never let one item's permit stand in for the whole batch. UI checks
   may decide which buttons to show, but the operation itself still needs a server-side authorization
   check.
3. **Enforce access to collections by the PDP's real output contract.** Pick an approach from what
   the PDP actually documents about its output and from what the data store can integrate with, rather
   than from a label such as ReBAC; OpenFGA's ListObjects and Cerbos's query-plan API are examples of
   different contracts. The source gives three ways to do it:
   - **Check each candidate.** The PEP pulls a bounded candidate set and evaluates each item, one at a
     time or in a batch. Use this for small sets when no list or filter interface exists. Keep the
     candidate data inside the trusted service until the checks finish, drop both denied and
     unresolved items, and apply the same restriction to counts, exports, and any other output that
     could expose protected data.
   - **Retrieve authorized identifiers.** The PDP returns the identifiers the subject may reach for a
     given action, and the app limits its retrieval to those identifiers plus its own tenant and
     business predicates. Treat the list as complete only when the API guarantees completion; OpenFGA,
     for example, documents deadline and result-count limits, so do not assume a pagination cursor or
     unlimited streaming. You may present a truncated subset as incomplete once the API promises that
     every item it returned is allowed, yet such a subset still cannot stand for the whole authorized
     set. Never read an empty or incomplete list as license to drop the restriction, and recheck
     authorization for later operations or when the state changes.
   - **Apply an authorization filter.** Here the PDP hands back a predicate, or a whole query plan,
     and the data layer applies it as it pulls the resources. Reach for a maintained adapter built for
     your exact PDP-and-data-store pairing:
     Cerbos PlanResources separates always-allowed, always-denied, and conditional plans, and OPA's
     Compile API supports partial evaluation. What each can do depends on the implementation and
     policy language, not on a blanket rule about ReBAC or any other model family.
4. **Security considerations that apply to every output.** An output is worth nothing unless the PEP
   enforces its complete meaning, and the response-integrity and trust requirements reach the channel
   and components that carry a decision. Specifically:
   - *Cover every data path.* Put the restriction on every shape of read: a listing, a search, an
     export, a count, an aggregate, and single-object lookups too. Being allowed to see a list is not
     permission to later update or delete those items.
   - *Intersect predicates.* Combine the authorization restriction with the app and tenant predicates
     using logical AND. An always-allowed result does not strip those other restrictions, and an
     always-denied result must return no protected data.
   - *Preserve query semantics.* Reject an unsupported operator or an incomplete translation. Check
     how the adapter treats nulls, missing attributes, joins, and collection membership against what
     the policy means, and never silently omit an expression you cannot translate.
   - *Keep values apart from syntax.* Pass filter values in as bound parameters, and keep an
     allow-list for the structural pieces like field names and operators. Never feed a returned debug
     string straight into the query engine (see the SQL Injection Prevention guidance on
     parameterized queries).
   - *Fail closed.* Deny protected operations on a PDP error, a timeout, or unusable output, and apply
     deny by default even when a filter is absent, because a missing filter is not an unrestricted
     result.
   - *Bound any reuse.* Cache a result only while the same subject, action, tenant, resource scope,
     and policy or input state all still hold, and only inside the approved freshness window. Account
     for changes between evaluation and use, so a cached permit never outlives a required revocation
     deadline.
5. **Verify the integration, not just the connection.** Exercise it against allowed resources and
   refused ones, across tenant lines, for every explicit kind of filter result, with batches or lists
   that come back incomplete, and under PDP failure. Line up the set a filter picks against what
   one-by-one decisions return for a representative spread of policy cases. Doing this confirms the
   adapter and the enforcement paths work, not only that the PDP answers. Batching and filtering can
   save effort, but they must not be used to give up enforcement or freshness just to reach a latency
   goal; for a large, queryable collection, lean on a query-filter integration that is documented, and
   otherwise drop back to bounded per-item checks when none exists or it cannot keep the policy's
   meaning.

## @security scenario

```gherkin
@security @owasp:authorization-output-handling @usecase:batch-decision-enforcement
Scenario: A denied item in a batch is not released by another item's permit
  Given a batch of access checks for one subject over several resources
  When the decision point permits some resources and denies one
  And the response for the denied resource is matched by its identifier
  Then the denied resource is withheld from the output
  And no permitted item's result is applied to the denied one
```

This scenario is the canonical copy. When you apply this sheet to real code, add it to the repo's
shared feature-file index (see `bdd-comprehensive-testing`, "Storing BDD scenarios permanently") and
wire it into CI (its "CI/CD wiring") so it runs as a blocking autotest in the same place as every
other Gherkin scenario.

## The real guarantee

What actually stops the leak is the PEP enforcing the full meaning of each decision on every output
path (list, count, export, read, update, and delete), matched per item and failing closed when a
result is missing or unusable. The `@security` scenario proves one denied item in a batch stays
hidden; per-item enforcement across every output path is what makes every list, filter, and export
safe. A test is a check; the PEP that enforces each decision in full is the guarantee.

## Sources

- OWASP Authorization Decisions and Output Handling Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Decisions_And_Output_Handling_Cheat_Sheet.html>, retrieved 2026-10-11): binding decisions to full context, per-item batch handling, the three collection-enforcement approaches (check each candidate, retrieve authorized identifiers, apply an authorization filter), and the security considerations (cover every data path, intersect predicates, preserve query semantics, separate values from syntax, fail closed, and bound reuse). `[documented]`
