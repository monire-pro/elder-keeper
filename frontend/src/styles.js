import { StyleSheet } from 'react-native';

export const theme = {
  colors: {
    background: '#F7F9FC',
    textPrimary: '#2D3436',
    textHint: '#636E72',
    red: '#FF5C5C',
    amber: '#FFD166',
    green: '#06D6A0',
    blue: '#118AB2',
  }
};

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 80,
  },
  header: {
    alignItems: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#FFF',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  statusContainer: {
    height: 100,
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 32,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
  },
  bigButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  hintText: {
    marginTop: 20,
    fontSize: 18,
    color: theme.colors.textHint,
  },
});