// ============================================
// IOL Salta - Diff Helper
// Compares actuaciones snapshots to detect new ones
// actId is a numeric string in IOL Salta
// ============================================

const IolDiff = {
  compare(currentActs, lastActId) {
    if (!Array.isArray(currentActs) || !currentActs.length) {
      return { newItems: [], hasChanges: false, maxActId: lastActId || 0 };
    }

    const maxActId = currentActs.reduce(
      (max, a) => Math.max(max, parseInt(a.actId) || 0),
      0
    );

    if (!lastActId) {
      return { newItems: [], hasChanges: false, maxActId };
    }

    const newItems = currentActs.filter(
      a => (parseInt(a.actId) || 0) > lastActId
    );

    return {
      newItems,
      hasChanges: newItems.length > 0,
      maxActId,
    };
  },
};
