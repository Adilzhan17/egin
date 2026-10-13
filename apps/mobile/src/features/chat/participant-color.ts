// Stable user identity mapping: adding/removing members cannot recolor existing users.
// More muted hues than the six examples reduce collisions without storing fake identities.
const light = ['#265f91','#725293','#9a493e','#236c70','#795d18','#5c682c','#945379','#38683f','#775540','#4b5f96','#88632a','#3e6e62'];
const dark = ['#91c7ef','#cfb0ef','#efaa98','#8cd5d4','#e5cf88','#c3d58d','#e6abd0','#a4d6aa','#dfbc9e','#acbfee','#e2c59a','#9dd4c3'];
export function participantColor(userId: string, night = false): string {
  let hash = 2166136261;
  for (const letter of userId) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return (night ? dark : light)[(hash >>> 0) % light.length];
}
