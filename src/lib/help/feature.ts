/**
 * `use:feature={"essay.add-paragraph"}` marks the element that presents a help feature (decision
 * 9441693e). It only names the feature: the words live in the help repository, and
 * tests/help-contract.test.ts fails when the two part. The id must be a string literal so that
 * test can read it.
 */
export function feature(node: HTMLElement, id: string) {
  node.dataset.feature = id;
  return {
    update(next: string) {
      node.dataset.feature = next;
    },
  };
}
