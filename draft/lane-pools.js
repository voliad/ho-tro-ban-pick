(() => {
  "use strict";

  // Vietnamese in-game position tabs from the supplied screenshots. The extra picks
  // requested for Trợ thủ and Đường Rồng are included in the secondary groups.
  const lanes = {
    "Tà Thần": {
      main: "zuka superman yena florentino veres biron kilgroth richter ryoma maloch dextra errol airi qi amily lu-bo omen allain volkath arthur roxie max bolt-baron taara skud bijan marja ata charlotte tamyn 11596",
      extra: "hayate toro lauriel arduin ybneth bright mina ngo-khong xeniel sinestrea ishar trieu-van zill butterfly billow teemee yan heino mganga kaine paine tachi jinna wonder-woman rourke omega the-flash ormarr wiro",
    },
    "Đi rừng": {
      main: "nakroth aoi bright kriknak ngo-khong sinestrea elandorr trieu-van murad fennik zill astrid butterfly keera zephys enzo lindis billow yan kaine paine quillen tachi wonder-woman rourke the-flash",
      extra: "zuka tulen florentino veres kilgroth moren ryoma dextra errol airi qi amily lu-bo dirak volkath bolt-baron slimz taara skud bijan marja ata darcy 11596",
    },
    "Đường giữa": {
      main: "raz liliana lauriel tulen iggy bonnie zata krixi lorion ishar yue natalya dieu-thuyen dirak veera goverra heino mganga aleister jinna kahlii ilumia azzenka ignis preyta darcy flowborn-2 evita",
      extra: "annette gildur rouie erin marja the-flash alice",
    },
    "Trợ thủ": {
      main: "aya helen toro dolia annette arduin alice ybneth gildur lumburr mina zip grakk xeniel dyadia arum rouie cresht baldum teemee krizzix sephera thane chaugnar omega ormarr wiro ming",
      extra: "veres bonnie dextra dieu-thuyen omen arthur max taara skud kaine tachi aleister ilumia azzenka enzo",
    },
    "Xạ thủ": {
      label: "Đường Rồng",
      main: "hayate violet valhein capheny telannas yorn stuart elsu moren laville celica teeri thorne wisp slimz flowborn erin",
      extra: "bright elandorr lindis heino 11596 murad",
    },
  };

  window.AOV_LANE_POOLS = Object.fromEntries(Object.entries(lanes).map(([lane, { label = lane, main, extra }]) => [
    lane, { label, main: new Set(main.split(" ")), extra: new Set(extra.split(" ")) },
  ]));
})();
