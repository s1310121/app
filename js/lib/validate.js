export function validateDayInput(day) {
  const errors = [];

  const numFields = [
    "steps","dist_km","time_min","RPE",
    "up_pct","down_pct","up_grade_pct","down_grade_pct",
    "surface_paved_pct","surface_trail_pct","surface_treadmill_pct","surface_track_pct",
  ];

  for (const f of numFields) {
    const v = Number(day[f]);
    if (!Number.isFinite(v)) errors.push(`${f} が数値ではありません`);
    if (v < 0) errors.push(`${f} が負です`);
  }

  const surfaceSum =
    Number(day.surface_paved_pct) +
    Number(day.surface_trail_pct) +
    Number(day.surface_treadmill_pct) +
    Number(day.surface_track_pct);

  if (Math.abs(surfaceSum - 100) > 1e-9) {
    errors.push(`路面割合の合計が100%ではありません（現在: ${surfaceSum}%）`);
  }

  if (!day.date || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
    errors.push("date は YYYY-MM-DD 形式で入力してください");
  }

  return { ok: errors.length === 0, errors, surfaceSum };
}

export function validateDays(days){
  const allErrors = [];
  days.forEach((d, i) => {
    const v = validateDayInput(d);
    if (!v.ok){
      v.errors.forEach(e => allErrors.push(`行${i+1}: ${e}`));
    }
  });
  return { ok: allErrors.length === 0, errors: allErrors };
}