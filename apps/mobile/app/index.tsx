/** 진입점: 인증 상태를 확인하는 동안 스플래시와 같은 색의 빈 화면. 분기는 _layout 의 AuthGate 가 한다 */
import { ActivityIndicator, View } from "react-native";
import { colors } from "@/theme";

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}
