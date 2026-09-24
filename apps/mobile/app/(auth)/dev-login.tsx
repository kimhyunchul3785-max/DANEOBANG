/**
 * DEV LOGIN — 개발 빌드에서만. 서버 ALLOW_DEV_LOGIN=false 면 403 (email_login_disabled) 로 막힌다.
 * 시드 계정: tester.owner@ · tester.t1@ · tester.s01@daneobang.dev (test1234), owner@/teacher@ (password)
 */
import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, errorMessage } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Card, Label } from "@/components/ui";
import { colors, spacing, surface, text } from "@/theme";

export default function DevLoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithToken } = useAuth();
  const [email, setEmail] = useState("tester.owner@daneobang.dev");
  const [password, setPassword] = useState("test1234");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!__DEV__) {
    router.replace("/(auth)/login");
    return null;
  }

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { token } = await api.auth.login({ email: email.trim(), password });
      await signInWithToken(token);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: insets.top + 24, gap: spacing.md }}>
      <Label>개발용 로그인</Label>
      <Text style={text.h1}>기존 계정으로</Text>
      <Card>
        <Label>이메일 또는 휴대폰</Label>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={[surface.input, { marginTop: 6 }]} placeholder="tester.owner@daneobang.dev" placeholderTextColor={colors.inkTertiary} />
        <Label style={{ marginTop: spacing.md }}>비밀번호</Label>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry style={[surface.input, { marginTop: 6 }]} onSubmitEditing={submit} />
        {err && (
          <Text style={[text.caption, text.accent, { marginTop: spacing.sm, fontWeight: "600" }]} accessibilityRole="alert">
            {err}
          </Text>
        )}
        <Button onPress={submit} loading={busy} style={{ marginTop: spacing.lg }}>
          로그인
        </Button>
        <Text style={[text.muted, { marginTop: spacing.md }]}>테스터: tester.owner@ · tester.t1@ · tester.s01@ (test1234) / 데모: owner@ · teacher@ (password)</Text>
      </Card>
      <Button variant="ghost" onPress={() => router.back()}>
        ← 돌아가기
      </Button>
    </View>
  );
}
