package app.geometrypanel.mobile;

import android.content.Context;
import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.Date;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.ExtendedKeyUsage;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.GeneralName;
import org.bouncycastle.asn1.x509.GeneralNames;
import org.bouncycastle.asn1.x509.KeyPurposeId;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.json.JSONObject;

/** A fresh device-local CA and h5 leaf. This never uses the APK update-signing key. */
final class CaptureCertificate {
    private CaptureCertificate() { }
    static synchronized JSONObject material(Context context) throws Exception {
        NativeVault vault = new NativeVault(context); String saved = vault.read("capture-certificate");
        if (saved != null) return new JSONObject(saved);
        JSONObject data = generate(); vault.save("capture-certificate", data.toString()); return data;
    }
    static JSONObject generate() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(2048); KeyPair caKey = generator.generateKeyPair(), leafKey = generator.generateKeyPair();
        long now = System.currentTimeMillis(); Date from = new Date(now - 86400000L), to = new Date(now + 5L * 365 * 86400000L);
        X500Name caName = new X500Name("CN=Geometry Panel local login CA"), leafName = new X500Name("CN=h5.zeehoev.com"); SecureRandom random = new SecureRandom();
        ContentSigner caSigner = new JcaContentSignerBuilder("SHA256withRSA").build(caKey.getPrivate());
        JcaX509v3CertificateBuilder caBuilder = new JcaX509v3CertificateBuilder(caName, new BigInteger(128, random).abs().add(BigInteger.ONE), from, to, caName, caKey.getPublic());
        caBuilder.addExtension(Extension.basicConstraints, true, new BasicConstraints(0)); caBuilder.addExtension(Extension.keyUsage, true, new KeyUsage(KeyUsage.keyCertSign | KeyUsage.cRLSign));
        X509Certificate ca = new JcaX509CertificateConverter().getCertificate(caBuilder.build(caSigner));
        JcaX509v3CertificateBuilder leafBuilder = new JcaX509v3CertificateBuilder(caName, new BigInteger(128, random).abs().add(BigInteger.ONE), from, to, leafName, leafKey.getPublic());
        leafBuilder.addExtension(Extension.basicConstraints, true, new BasicConstraints(false)); leafBuilder.addExtension(Extension.keyUsage, true, new KeyUsage(KeyUsage.digitalSignature | KeyUsage.keyEncipherment));
        leafBuilder.addExtension(Extension.extendedKeyUsage, false, new ExtendedKeyUsage(KeyPurposeId.id_kp_serverAuth));
        leafBuilder.addExtension(Extension.subjectAlternativeName, false, new GeneralNames(new GeneralName(GeneralName.dNSName, "h5.zeehoev.com")));
        X509Certificate leaf = new JcaX509CertificateConverter().getCertificate(leafBuilder.build(caSigner)); leaf.verify(caKey.getPublic());
        JSONObject data = NativeJson.obj("ca", Base64.getEncoder().encodeToString(ca.getEncoded()), "leaf", Base64.getEncoder().encodeToString(leaf.getEncoded()), "key", Base64.getEncoder().encodeToString(leafKey.getPrivate().getEncoded()));
        return data;
    }
    static byte[] publicCa(Context context) throws Exception { return Base64.getDecoder().decode(material(context).getString("ca")); }
    static SSLContext server(Context context) throws Exception {
        return context(material(context));
    }
    static SSLContext context(JSONObject data) throws Exception {
        CertificateFactory certificates = CertificateFactory.getInstance("X.509");
        X509Certificate ca = (X509Certificate) certificates.generateCertificate(new ByteArrayInputStream(Base64.getDecoder().decode(data.getString("ca")))), leaf = (X509Certificate) certificates.generateCertificate(new ByteArrayInputStream(Base64.getDecoder().decode(data.getString("leaf"))));
        leaf.checkValidity(); ca.checkValidity(); KeyStore store = KeyStore.getInstance(KeyStore.getDefaultType()); store.load(null);
        java.security.PrivateKey key = KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(data.getString("key"))));
        char[] password = new char[0]; store.setKeyEntry("h5", key, password, new java.security.cert.Certificate[] {leaf, ca});
        KeyManagerFactory manager = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()); manager.init(store, password);
        SSLContext ssl = SSLContext.getInstance("TLS"); ssl.init(manager.getKeyManagers(), null, new SecureRandom()); return ssl;
    }
}
