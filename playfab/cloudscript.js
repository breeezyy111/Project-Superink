// Project SuperInk: OPTIONAL PlayFab CloudScript (legacy JavaScript CloudScript).
// The game works without it: it finds the next free GuestNN name itself.
// Upload in Game Manager: Automation > CloudScript > Revisions (Legacy) > Upload new revision,
// then tick "Deploy this revision".
//
// assignGuestName hands out guest names in sign-up order: Guest01, Guest02, ... Guest09, Guest010, ...
// (always "Guest0" followed by the player's number). The counter lives in Title Internal Data,
// which players can't read or edit. The client then claims the name as its display name; if two
// guests ever grab the same number at once, the client calls again with retry=true for the next one.

handlers.assignGuestName = function (args, context) {
  var mine = server.GetUserReadOnlyData({ PlayFabId: currentPlayerId, Keys: ["guestName"] });
  var existing = mine.Data && mine.Data.guestName && mine.Data.guestName.Value;
  if (existing && !(args && args.retry)) return { name: existing };

  var data = server.GetTitleInternalData({ Keys: ["guestCounter"] });
  var n = parseInt((data.Data && data.Data.guestCounter) || "0", 10);
  if (isNaN(n)) n = 0;
  n += 1;
  server.SetTitleInternalData({ Key: "guestCounter", Value: String(n) });

  var name = "Guest0" + n;
  server.UpdateUserReadOnlyData({ PlayFabId: currentPlayerId, Data: { guestName: name } });
  return { name: name };
};
